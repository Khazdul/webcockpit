// Own images (stage 80 part D, ADR 0172) without a server: the picker's
// My images tab. Logged out (the device's space) it is the login card and
// no own image is shown anywhere, also one left in the device's stores.
// In an account's space (the space record alone: no API call is made under
// webdriver) the shelf works on this device: Add image, a file that is no
// picture, the crop by keys and the wheel, Save image (WebP, at most 30 720
// bytes), the image as the portrait and as a member's Group token, the
// full shelf, Remove saying who uses it and putting them back on automatic.
// Against the GMCP demo (the dev feed through the live app, where looks are
// drawn). Screenshots go to the test's output folder.
import { type Page, type TestInfo, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const FACE = 'tests/fixtures/looks/face.png';
const disc = (page: Page) => page.locator('.wc-pane-character .wc-cc-disc');
const dlg = (page: Page) => page.locator('[data-dlg="look"]');
const tab = (page: Page, id: string) => dlg(page).locator(`[role="tab"][data-tab="${id}"]`);
const slots = (page: Page) => dlg(page).locator('.wc-looks-slot.is-full');
const msg = (page: Page) => dlg(page).locator('.wc-looks-msg');
const group = (page: Page) => page.locator('.wc-pane[data-pane="group"] .wc-pane-content');

const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);
const v = (hp: number) => ({ hp, maxhp: 160, mana: 70, maxmana: 100, mp: 90, maxmp: 110 });

/** The demo with Character and Group on; `account`: the page in an account's space (the record only). */
async function demo(page: Page, o: { account?: boolean } = {}): Promise<void> {
  if (o.account) await page.addInitScript(() => localStorage.setItem('wc.space', JSON.stringify({ nameKey: 'shelftest', state: 'open' })));
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto(DEMO);
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true }, group: { on: true } }, character: { height: 'auto' } }));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await emit(page, 'Group.Set', [{ id: 2, type: 'ally', name: 'Glorfindel', ...v(70), position: 'standing' }]);
}

async function openMine(page: Page): Promise<void> {
  await disc(page).click();
  await expect(dlg(page)).toBeVisible();
  await tab(page, 'mine').click();
}

const shot = async (page: Page, info: TestInfo, name: string, el = dlg(page)) => {
  const path = info.outputPath(`${name}.png`);
  await el.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
};

test('logged out: the login card, and no own image is shown anywhere', async ({ page }, info) => {
  // An own look and an image left in the device's stores (as no client writes them): never shown.
  await demo(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open('webcockpit');
      q.onsuccess = () => r(q.result);
    });
    const t = db.transaction(['looks', 'lookImages'], 'readwrite');
    t.objectStore('looks').put({ names: { rasta: { look: { src: 'own', id: 'AbCdEfGhIjKlMnOpQrStUv' }, at: 1, own: true } } }, 'looks');
    t.objectStore('lookImages').put({ id: 'AbCdEfGhIjKlMnOpQrStUv', label: 'x', webp: 'UklGRgAAAABXRUJQ', created: 1 });
    await new Promise((r) => (t.oncomplete = r));
    db.close();
  });
  await page.reload();
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  expect(await page.evaluate(() => window.__wc!.app.looks!.stored('rasta'))).toEqual({ src: 'own', id: 'AbCdEfGhIjKlMnOpQrStUv' });
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await expect(disc(page).locator('img[src^="data:image/webp"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__wc!.app.looks!.ownIds())).toBeNull();

  await openMine(page);
  const card = dlg(page).locator('[data-mine="login"]');
  await expect(card).toContainText('Log in to use your own images.');
  await expect(card).toContainText('only you ever see them');
  await expect(dlg(page).locator('.wc-looks-shelf')).toHaveCount(0);
  await expect(card.locator('[data-btn="LOGIN"]')).toHaveText('Log in');
  await expect(dlg(page)).not.toContainText('WebCockpit');
  await shot(page, info, 'mine-logged-out');
  // The demo is a replay: Log in leaves for the start page's Log in.
  await card.locator('[data-btn="LOGIN"]').click();
  await page.waitForURL(/\?account=login|\/$/);
});

test('in an account: add, crop, save, the portrait and the Group token, a bad file, the full shelf, remove', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demo(page, { account: true });
  expect(await page.evaluate(() => window.__wc!.app.looks!.ownIds()?.size)).toBe(0);
  await openMine(page);
  await expect(dlg(page).locator('.wc-looks-count')).toContainText('0 of 50 images');
  await expect(dlg(page).locator('.wc-looks-count')).toContainText('Only you see them');

  // A file that is no picture: a plain message, no crop.
  await dlg(page).locator('.wc-looks-file').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not a picture at all') });
  await expect(msg(page)).toHaveText('This file could not be opened as a picture. Try a PNG, JPEG or WebP.');
  await expect(dlg(page).locator('[data-mine="crop"]')).toHaveCount(0);

  // A picture: the crop step, moved by keys, zoomed by the wheel and + .
  await dlg(page).locator('.wc-looks-file').setInputFiles(FACE);
  const crop = dlg(page).locator('[data-mine="crop"]');
  await expect(crop).toBeVisible();
  await expect(crop.locator('.wc-looks-cut')).toBeVisible();
  const zoom = crop.locator('.wc-looks-zoomr');
  await expect(zoom).toHaveValue('100');
  const area = crop.locator('.wc-looks-croparea');
  await area.hover();
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(110);
  await area.focus();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(crop.locator('.wc-looks-meta b')).toHaveText(/256 × 256 · \d+ KB/);
  await page.waitForTimeout(200);
  await shot(page, info, 'mine-crop');
  await crop.locator('[data-btn="CROP-SAVE"]').click();
  await expect(crop).toHaveCount(0);
  await expect(slots(page)).toHaveCount(1);
  await expect(slots(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(dlg(page).locator('.wc-looks-count')).toContainText('1 of 50 images');
  // Shown live in the pane; kept by "Use this look".
  await expect(disc(page)).toHaveAttribute('data-art', 'own');
  await dlg(page).locator('[data-btn="USE"]').click();
  await expect(dlg(page)).toHaveCount(0);
  const stored = await page.evaluate(() => {
    const l = window.__wc!.app.looks!;
    const look = l.stored('rasta') as { src: string; id: string };
    const img = l.images!.get(look.id)!;
    return { look, label: img.label, size: atob(img.webp).length, head: atob(img.webp).slice(0, 4) + atob(img.webp).slice(8, 12) };
  });
  expect(stored.look.src).toBe('own');
  expect(stored.label).toBe('face');
  expect(stored.size).toBeLessThanOrEqual(30_720);
  expect(stored.head).toBe('RIFFWEBP');
  await expect(disc(page).locator('img.wc-cc-photo')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  // Stored in the space's database, and still there after a reload.
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await expect(disc(page).locator('img.wc-cc-photo')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { group: { on: true } } }));
  await emit(page, 'Group.Set', [{ id: 2, type: 'ally', name: 'Glorfindel', ...v(70), position: 'standing' }]);

  // The same image for a member: the Group token.
  const tk = group(page).locator('.wc-gp-row[data-key="m2"] .wc-gp-tk');
  await tk.click();
  await expect(dlg(page)).toHaveAttribute('aria-label', 'Look for Glorfindel');
  await tab(page, 'mine').click();
  await slots(page).first().click();
  await dlg(page).locator('[data-btn="USE"]').click();
  await expect(tk.locator('.wc-gp-tkd.is-own img')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await shot(page, info, 'own-group-token', page.locator('.wc-pane[data-pane="group"]'));
  await shot(page, info, 'own-portrait', page.locator('.wc-pane-character'));

  // The full shelf: 49 more put in the store; Add image asks to remove one first.
  await page.evaluate(async () => {
    const imgs = window.__wc!.app.looks!.images!;
    const first = imgs.list()[0]!;
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open('webcockpit-u-shelftest');
      q.onsuccess = () => r(q.result);
    });
    const t = db.transaction('lookImages', 'readwrite');
    for (let i = 0; i < 49; i++) t.objectStore('lookImages').put({ ...first, id: `${String(i).padStart(2, '0')}cdefghijklmnopqrstuv`, label: `copy ${i}`, created: first.created + 1 + i });
    await new Promise((r) => (t.oncomplete = r));
    db.close();
  });
  await page.reload();
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await expect.poll(() => page.evaluate(() => window.__wc!.app.looks!.ownIds()?.size)).toBe(50);
  await openMine(page);
  await expect(dlg(page).locator('.wc-looks-count')).toContainText('50 of 50 images');
  await expect(dlg(page).locator('[data-btn="ADD"]')).toHaveAttribute('data-full', '');
  await dlg(page).locator('[data-btn="ADD"]').click();
  await expect(msg(page)).toHaveText('Your shelf is full (50 of 50). Remove an image first.');
  await shot(page, info, 'mine-full');

  // Remove the image in use: the dialog says who uses it; both go back to automatic.
  await expect(slots(page).first()).toHaveAttribute('aria-pressed', 'true');
  await dlg(page).locator('[data-btn="REMOVE"]').click();
  await expect(dlg(page).locator('.wc-looks-rm.is-ask')).toContainText('2 characters use this image (Glorfindel, Rasta). They go back to automatic.');
  await dlg(page).locator('[data-btn="REMOVE-YES"]').click();
  await expect(dlg(page).locator('.wc-looks-count')).toContainText('49 of 50 images');
  await dlg(page).locator('[data-btn="CANCEL"]').click();
  expect(await page.evaluate(() => [window.__wc!.app.looks!.stored('rasta'), window.__wc!.app.looks!.stored('glorfindel')])).toEqual([{ src: 'auto' }, { src: 'auto' }]);
  await expect(disc(page)).toHaveAttribute('data-look', 'auto');
  await expect(group(page).locator('.wc-gp-tkd.is-own')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('in an account: an own image is a map token, its bytes sent to the worker once', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('wc.space', JSON.stringify({ nameKey: 'shelftest', state: 'open' }));
    const Base = window.Worker;
    const w = window as unknown as { __mapWorkers: Worker[]; __ownSent: string[] };
    w.__mapWorkers = [];
    w.__ownSent = [];
    window.Worker = class extends Base {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        if (opts?.name !== 'map') return;
        w.__mapWorkers.push(this);
        const post = this.postMessage.bind(this);
        this.postMessage = ((m: unknown, t?: Transferable[]) => {
          const x = m as { t?: string; key?: string; bytes?: ArrayBuffer };
          if (x?.t === 'tokenImage' && x.key?.startsWith('own:') && x.bytes) w.__ownSent.push(`${x.key}:${x.bytes.byteLength}`);
          return t ? post(m, t) : post(m);
        }) as Worker['postMessage'];
      }
    };
  });
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  // An own image made here (a cream face on blue, WebP) and chosen for Rasta.
  const id = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a4d8f';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f2e6c8';
    g.beginPath();
    g.arc(128, 128, 90, 0, Math.PI * 2);
    g.fill();
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/webp', 0.8));
    const looks = window.__wc!.app.looks!;
    const img = await looks.images!.add(new Uint8Array(await b.arrayBuffer()), 'face');
    looks.choose('Rasta', { src: 'own', id: img.id }, true);
    return img.id;
  });
  await emit(page, 'Char.Name', { name: 'Rasta', fullname: 'Rasta the Wanderer' });
  await emit(page, 'Char.StatusVars', { name: 'Rasta', race: 'Man', subrace: 'Dunadan' });
  await page.evaluate(() => {
    const w = (window as unknown as { __mapWorkers: Worker[] }).__mapWorkers[0]!;
    w.postMessage({ t: 'debugScene', scene: { room: 7636, located: true, color: 0xffff00, path: [], members: [] }, center: { room: 7636 }, zoom: 1.4 });
  });
  await expect(content).toHaveAttribute('data-map-self-look', `own:${id}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ownSent: string[] }).__ownSent), { timeout: 15_000 }).toEqual([expect.stringMatching(new RegExp(`^own:${id}:\\d+$`))]);
  // The cream face is drawn in the token at the centre.
  await page.waitForTimeout(800);
  const shot = await page.locator('.wc-pane-map canvas').screenshot();
  const cream = await page.evaluate(async (png) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(img.width / 2 - 12, img.height / 2 - 12, 24, 24).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! > 220 && d[i + 1]! > 205 && d[i + 2]! > 170 && d[i + 2]! < 225) n++;
    return n;
  }, shot.toString('base64'));
  expect(cream).toBeGreaterThan(100);
  const path = info.outputPath('own-map-token.png');
  await page.locator('.wc-pane-map').screenshot({ path });
  await info.attach('own-map-token', { path, contentType: 'image/png' });
  // A redraw sends nothing again.
  await page.evaluate(() => window.__wc!.app.looks!.choose('Rasta', { src: 'auto' }, true));
  await expect(content).toHaveAttribute('data-map-self-look', 'drawn:dunadan:male');
  await page.evaluate((i) => window.__wc!.app.looks!.choose('Rasta', { src: 'own', id: i }, true), id);
  await expect(content).toHaveAttribute('data-map-self-look', `own:${id}`);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __ownSent: string[] }).__ownSent.length)).toBe(1);
  expect(errors).toEqual([]);
});
