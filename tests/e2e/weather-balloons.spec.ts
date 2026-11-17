// Stage 69 (ADR 0159): balloon notices. The Balloons switch under Settings →
// Weather effects loads and unloads them live; `#weather balloon …` shows
// one without a fight; a real kill (a fake MUME) sends one up.
import { type Page, expect, test } from '@playwright/test';

const toggle = (page: Page, label: string) => page.locator(`.wc-sp-settings .wc-ck-tg[aria-label="${label}"]`);
const layers = (page: Page) => page.locator('.wc-cockpit > .wc-balloons');
const balloon = (page: Page) => page.locator('.wc-cockpit > .wc-balloons .wc-balloon');

async function type(page: Page, text: string): Promise<void> {
  await page.locator('.wc-input-field').fill(text);
  await page.keyboard.press('Enter');
}

test('Settings → Weather effects → Balloons loads them live; #weather balloon shows one; off unloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();

  // The effects off: the command says how to turn them on.
  await type(page, '#weather balloon great');
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: 'turn on Settings → Weather effects first' })).toHaveCount(1);

  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="weather"]').click();
  await expect(toggle(page, 'Balloons')).toHaveAttribute('aria-checked', 'false');
  await toggle(page, 'Weather effects').click();
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  // Weather on, Balloons off: nothing of the balloons is there.
  await expect(layers(page)).toHaveCount(0);

  await toggle(page, 'Balloons').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.balloons)).toBe(true);
  await expect(layers(page)).toHaveCount(2);
  // The sky layer right after the back canvas (under the text), the front one above.
  expect(await page.evaluate(() => document.querySelector('.wc-cockpit > canvas.wc-weather-back')!.nextElementSibling!.className)).toBe('wc-balloons wc-balloons-sky');
  await page.keyboard.press('Escape');

  await type(page, '#weather balloon great');
  const b = balloon(page);
  await expect(b).toHaveCount(1);
  await expect(page.locator('.wc-balloons-front .wc-balloon')).toHaveCount(1);
  await expect(b.locator('.wc-bsign-who')).toHaveText('An Uruk-hai tracker');
  await expect(b.locator('.wc-bsign-xp')).toHaveText('+3.7kXP');
  await expect(b.locator('.wc-bsign-rate')).toHaveText('Great');
  // After the readable phase it is in the sky layer, behind the text.
  await expect(page.locator('.wc-balloons-sky .wc-balloon')).toHaveCount(1, { timeout: 12_000 });

  // A burst: four kills on one sign.
  await type(page, '#weather balloon burst');
  const front = page.locator('.wc-balloons-front .wc-balloon');
  await expect(front.locator('.wc-bsign-who')).toHaveText('4 kills', { timeout: 5_000 });
  await expect(front.locator('.wc-bsign-rate')).toHaveText('Great');

  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="weather"]').click();
  await toggle(page, 'Balloons').click();
  await expect(layers(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

const IAC = 255, WILL = 251, SB = 250, SE = 240, GMCP = 201;
const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

test('a real kill sends a balloon up with its name and XP (calibrating: no rating word)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(page.locator('.wc-cockpit > .wc-balloons')).toHaveCount(2);
  server!.send(gmcp('Char.Name {"name":"Balloonist","fullname":"Balloonist the Mock"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing · Balloonist/);
  server!.send(gmcp('Char.Vitals {"hp":100,"maxhp":100,"xp":5770000,"tp":41500}'));
  server!.send(bytes('An orc scout is dead! R.I.P.\r\n'));
  server!.send(gmcp('Char.Vitals {"xp":5772600}'));
  const b = balloon(page);
  await expect(b).toHaveCount(1);
  await expect(b.locator('.wc-bsign-who')).toHaveText('An orc scout');
  await expect(b.locator('.wc-bsign-xp')).toHaveText('+2.6kXP');
  await expect(b.locator('.wc-bsign-rate')).toBeHidden();
  expect(errors).toEqual([]);
});
