// Enter MUME's transition on a phone (ADR 0125, addendum): a tap sends the
// page away over the cockpit; Exit session brings it back as it was.
import { type Page, expect, test } from '@playwright/test';

const startSel = (page: Page) => page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label');
const overlay = (page: Page) => page.locator('.wc-overlay');

test('a tap on Enter MUME plays the transition; Exit session resets the page', async ({ page }) => {
  let opened = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    opened++;
    ws.send(Buffer.from('\r\nBy what name do you wish to be known? ', 'latin1'));
  });
  await page.goto('/?phone=1');
  await expect(startSel(page)).toHaveText('Enter MUME');
  const row = page.locator('.wc-start .wc-sm-item[data-key="enter"]');
  await row.tap();
  // The page lies over the cockpit, in the same place, while it leaves.
  const s = await page.evaluate(() => ({
    leaving: document.querySelector('.wc-start')!.classList.contains('is-leaving'),
    host: document.querySelector<HTMLElement>('.wc-start-host')!.style.position,
    cockpit: getComputedStyle(document.querySelector('.wc-app')!).display,
  }));
  expect(s).toEqual({ leaving: true, host: 'fixed', cockpit: 'flex' });
  // A second tap lands on the cockpit.
  await row.tap({ force: true });
  await expect(page.locator('.wc-start')).toBeHidden();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  expect(opened).toBe(1);

  // Exit session: the start page as it was, with its keys.
  await page.locator('.wc-menu-btn').tap();
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('y');
  await expect(startSel(page)).toHaveText('Enter MUME');
  const back = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.wc-start')!;
    return {
      leaving: el.classList.contains('is-leaving'),
      host: document.querySelector<HTMLElement>('.wc-start-host')!.style.position,
      anims: el.getAnimations({ subtree: true }).filter((a) => (a.effect as KeyframeEffect).getTiming().fill === 'forwards').length,
      opacity: getComputedStyle(el).opacity,
    };
  });
  expect(back).toEqual({ leaving: false, host: 'relative', anims: 0, opacity: '1' });
});
