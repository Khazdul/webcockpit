// Enter MUME's transition (ADR 0125, addendum): the scenery fades away, the
// sky zooms and it fades out over the cockpit, which is shown, focused and
// connecting from the first moment. Against a mocked MUME WebSocket.
import { type Page, expect, test } from '@playwright/test';

async function mockMume(page: Page): Promise<() => number> {
  let opened = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    opened++;
    ws.send(Buffer.from('\r\nBy what name do you wish to be known? ', 'latin1'));
  });
  return () => opened;
}

const start = (page: Page) => page.locator('.wc-start');
const startSel = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item.is-sel .wc-sm-label');
const field = (page: Page) => page.locator('.wc-input-field');

async function openStart(page: Page): Promise<() => number> {
  const opened = await mockMume(page);
  await page.goto('/');
  await expect(startSel(page)).toHaveText('Enter MUME');
  return opened;
}

/** The start surface's running animations (the transition's), and the host's inline style. */
const state = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('.wc-start')!;
    const host = document.querySelector<HTMLElement>('.wc-start-host')!;
    const ours = (el: Element | null) =>
      el ? el.getAnimations().filter((a) => (a.effect as KeyframeEffect).getTiming().fill === 'forwards').length : 0;
    return {
      leaving: s.classList.contains('is-leaving'),
      surface: ours(s),
      sky: ours(s.querySelector('.wc-start-skyhost')),
      panel: ours(s.querySelector('.wc-sm-panel')),
      position: host.style.position,
      opacity: getComputedStyle(s).opacity,
    };
  });

test('Enter MUME: the page leaves over the cockpit; keys go to the input at once; then it is gone', async ({ page }) => {
  const opened = await openStart(page);
  await page.keyboard.press('Enter');
  // At once: connecting, the input has the focus, the page is still there and leaving.
  await expect.poll(opened).toBe(1);
  const s = await state(page);
  expect(s).toMatchObject({ leaving: true, surface: 1, sky: 1, panel: 1, position: 'fixed' });
  await expect(field(page)).toBeFocused();
  // Keys typed meanwhile reach the input, never the start menu (P would open the Profile list).
  await page.keyboard.type('pa');
  await expect(field(page)).toHaveValue('pa');
  await expect(page.locator('.wc-pl')).toHaveCount(0);
  // The end: the page is hidden and its host back in the flow.
  await expect(start(page)).toBeHidden();
  expect(await state(page)).toMatchObject({ leaving: false, surface: 0, sky: 0, panel: 0, position: 'relative' });
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('pa');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  expect(opened()).toBe(1);
});

test('a second click or Enter during the transition does not enter twice', async ({ page }) => {
  const opened = await openStart(page);
  const row = page.locator('.wc-start .wc-sm-item[data-key="enter"]');
  const box = (await row.boundingBox())!;
  await row.click();
  // The page takes no pointer events now: this click lands on the cockpit.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('Enter');
  await expect(start(page)).toBeHidden();
  await page.waitForTimeout(300);
  expect(opened()).toBe(1);
});

test('Exit during the transition puts the start page back as it was; Enter MUME again', async ({ page }) => {
  await openStart(page);
  await page.keyboard.press('Enter');
  // Held mid-way, so the exit surely comes during it.
  await page.evaluate(() => {
    for (const a of document.getAnimations()) if ((a.effect as KeyframeEffect).getTiming().fill === 'forwards') a.pause();
  });
  expect((await state(page)).leaving).toBe(true);
  await page.locator('.wc-mb[data-mb="exit"]').click();
  await page.keyboard.press('y');
  await expect(startSel(page)).toHaveText('Enter MUME');
  expect(await state(page)).toMatchObject({ leaving: false, surface: 0, sky: 0, panel: 0, position: 'relative', opacity: '1' });
  await expect(page.locator('.wc-app')).toBeHidden();
  // The menu has its keys again.
  await page.keyboard.press('ArrowDown');
  await expect(startSel(page)).toHaveText('Profile');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(start(page)).toBeHidden();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
});

test('with reduced motion: a short fade, nothing moves or zooms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStart(page);
  await page.keyboard.press('Enter');
  expect(await state(page)).toMatchObject({ leaving: true, surface: 1, sky: 0, panel: 0 });
  await expect(start(page)).toBeHidden({ timeout: 1000 });
  await expect(field(page)).toBeFocused();
});
