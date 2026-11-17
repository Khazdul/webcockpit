// Stage 69 (ADR 0159): balloon notices. The Balloons switch under Settings →
// Weather effects loads and unloads them live; `#weather balloon …` shows
// one without a fight; a real kill and an achievement (a fake MUME) send
// balloons up. Round 2: the balloons are under every pane, docked or
// floating, in every phase; a level up, a death and an achievement have
// balloons of their own; the phone's layout never loads them.
import { type Page, expect, test } from '@playwright/test';

const toggle = (page: Page, label: string) => page.locator(`.wc-sp-settings .wc-ck-tg[aria-label="${label}"]`);
const layers = (page: Page) => page.locator('.wc-cockpit > .wc-balloons');
const balloon = (page: Page) => page.locator('.wc-cockpit > .wc-balloons .wc-balloon');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');

async function type(page: Page, text: string): Promise<void> {
  await page.locator('.wc-input-field').fill(text);
  await page.keyboard.press('Enter');
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('Settings → Weather effects → Balloons loads them live; #weather balloon shows one; off unloads', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();

  // The effects off: the command says how to turn them on.
  await type(page, '#weather balloon great');
  await expect(rows(page).filter({ hasText: 'turn on Settings → Weather effects first' })).toHaveCount(1);

  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="weather"]').click();
  await expect(toggle(page, 'Balloons')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.wc-sp-wx-balloons')).toContainText('Desktop only');
  await toggle(page, 'Weather effects').click();
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  // Weather on, Balloons off: nothing of the balloons is there.
  await expect(layers(page)).toHaveCount(0);

  await toggle(page, 'Balloons').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.balloons)).toBe(true);
  await expect(layers(page)).toHaveCount(2);
  // The sky layer right after the back canvas (under the text); the front one right after the game pane (over the text, under the panes).
  expect(await page.evaluate(() => document.querySelector('.wc-cockpit > canvas.wc-weather-back')!.nextElementSibling!.className)).toBe('wc-balloons wc-balloons-sky');
  expect(await page.evaluate(() => document.querySelector('.wc-cockpit > .wc-game')!.nextElementSibling!.className)).toBe('wc-balloons wc-balloons-front');
  await page.keyboard.press('Escape');

  await type(page, '#weather balloon great');
  const b = balloon(page);
  await expect(b).toHaveCount(1);
  await expect(page.locator('.wc-balloons-front .wc-balloon')).toHaveCount(1);
  await expect(b.locator('.wc-bsign-who')).toHaveText('An Uruk-hai tracker');
  await expect(b.locator('.wc-bsign-xp')).toHaveText('+3.7kXP');
  await expect(b.locator('.wc-bsign-rate')).toHaveText('Great');
  // A slow rise (about 7 s), readable about 5.5 s, then it leaves into the sky layer, behind the text.
  await expect(page.locator('.wc-balloons-sky .wc-balloon')).toHaveCount(1, { timeout: 20_000 });

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

test('round 2: a level up, a death and an achievement each rise on a balloon of their own', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  await type(page, '#weather balloon burst');
  await type(page, '#weather balloon levelup');
  await type(page, '#weather balloon death');
  await type(page, '#weather balloon achievement');
  const signs = page.locator('.wc-balloons-front .wc-bsign');
  await expect(signs.filter({ hasText: 'Level 23!' })).toHaveCount(1);
  await expect(signs.filter({ hasText: 'You died' })).toHaveCount(1);
  const ach = signs.filter({ hasText: 'Achievement' });
  await expect(ach).toHaveCount(1);
  await expect(ach.locator('.wc-bsign-who')).toContainText('Old Forest');
  await expect(page.locator('.wc-balloons-front .wc-bsign[data-face="levelup"]')).toHaveCount(1);
  // The burst's later kills still join the kill balloon only.
  await expect(signs.filter({ hasText: '4 kills' })).toHaveCount(1, { timeout: 5_000 });
  await expect(balloon(page)).toHaveCount(4);
  // The achievement's text stays on its plank: four lines at most, inside the balloon's planned height.
  const box = await ach.locator('.wc-bsign-who').evaluate((e) => ({ h: (e as HTMLElement).offsetHeight, lh: parseFloat(getComputedStyle(e).lineHeight) }));
  expect(box.h).toBeLessThanOrEqual(box.lh * 4 + 1);
  const el = ach.locator('xpath=ancestor::*[contains(@class,"wc-balloon")][1]');
  const h = await el.evaluate((e) => (e as HTMLElement).offsetHeight);
  expect(h).toBeLessThanOrEqual(335);
  expect(errors).toEqual([]);
});

test('round 2: the balloons are under every pane, docked and floating, in every phase; over the bare game text only while readable', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  // A floating pane: Statistics, over the game pane.
  await page.locator('.wc-mb[data-mb="panes"]').click();
  await page.locator('.wc-pop-row[data-pane="statistics"]').click();
  await page.keyboard.press('Escape');
  const float = page.locator('.wc-pane[data-pane="statistics"]');
  await expect(float).toHaveAttribute('data-floating', '');

  // What paints on top at a point, as the browser hit-tests it: a probe that
  // takes the pointer fills each balloon layer (they take none themselves).
  const order = (where: 'float' | 'docked' | 'text') =>
    page.evaluate((where) => {
      for (const l of document.querySelectorAll('.wc-cockpit > .wc-balloons')) {
        if (l.querySelector(':scope > .probe')) continue;
        const p = document.createElement('div');
        p.className = 'probe';
        p.style.cssText = 'position:absolute;inset:0;pointer-events:auto';
        l.append(p);
      }
      const docked = [...document.querySelectorAll<HTMLElement>('.wc-cockpit > .wc-pane:not([data-floating]):not([hidden])')].find((e) => e.offsetWidth > 50)!;
      const el = where === 'float' ? document.querySelector<HTMLElement>('.wc-pane[data-floating]:not([hidden])')! : where === 'docked' ? docked : document.querySelector<HTMLElement>('.wc-game')!;
      const r = el.getBoundingClientRect();
      // the bare text: the game pane's left part, above the input row, clear of the floating pane
      const x = where === 'text' ? r.left + 40 : r.left + r.width / 2;
      const y = where === 'text' ? r.top + 40 : r.top + r.height / 2;
      const stack = document.elementsFromPoint(x, y);
      const at = (pred: (e: Element) => boolean) => stack.findIndex(pred);
      return {
        target: at((e) => e === el || el.contains(e)),
        front: at((e) => e.classList.contains('probe') && e.parentElement!.classList.contains('wc-balloons-front')),
        sky: at((e) => e.classList.contains('probe') && e.parentElement!.classList.contains('wc-balloons-sky')),
      };
    }, where);

  await type(page, '#weather balloon good');
  const seen = new Set<string>();
  const check = async () => {
    const phase = await page.evaluate(() => {
      const b = document.querySelector('.wc-balloon');
      return b ? (b.parentElement!.classList.contains('wc-balloons-front') ? 'front' : 'sky') : 'gone';
    });
    if (phase === 'gone') return phase;
    seen.add(phase);
    for (const where of ['float', 'docked'] as const) {
      const o = await order(where);
      expect(o.target, `${where} ${phase}`).toBeGreaterThanOrEqual(0);
      expect(o.target, `${where} over the front layer (${phase})`).toBeLessThan(o.front);
      expect(o.target, `${where} over the sky layer (${phase})`).toBeLessThan(o.sky);
    }
    const t = await order('text');
    // the front layer over the game text, the sky under it
    expect(t.front).toBeLessThan(t.target);
    expect(t.target).toBeLessThan(t.sky);
    return phase;
  };
  // arriving and readable (front), then gliding and drifting (sky)
  await expect(page.locator('.wc-balloons-front .wc-balloon')).toHaveCount(1);
  await check();
  await expect(page.locator('.wc-balloons-sky .wc-balloon')).toHaveCount(1, { timeout: 20_000 });
  await check();
  expect([...seen].sort()).toEqual(['front', 'sky']);
  expect(errors).toEqual([]);
});

test('round 2: desktop only: the phone layout never loads the balloons, and #weather balloon says so', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  expect(await page.evaluate(() => window.__wc!.app.cockpit.isPhoneGame)).toBe(true);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await page.locator('.wc-input-slot .wc-input-field').fill('#weather balloon levelup');
  await page.keyboard.press('Enter');
  await expect(rows(page).filter({ hasText: 'Balloons are desktop only' })).toHaveCount(1);
  // Nothing of them, and their chunk never fetched.
  await expect(layers(page)).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /balloons\/(notices|balloons|flight)/.test(r.name)))).toBe(false);
  expect(errors).toEqual([]);
});

const IAC = 255, WILL = 251, SB = 250, SE = 240, GMCP = 201;
const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

test('a real kill sends a balloon up with its name and XP (calibrating: no rating word); an achievement one of its own', async ({ page }) => {
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
  server!.send(gmcp('Event.Achieved {"what":"You have slain your first orc scout."}'));
  await expect(b).toHaveCount(2);
  await expect(b.nth(1).locator('.wc-bsign-who')).toHaveText('You have slain your first orc scout.');
  await expect(b.nth(0).locator('.wc-bsign-who')).toHaveText('An orc scout');
  expect(errors).toEqual([]);
});
