// Stage 7 P3: Spotlights, Credits and Options → Spotlights on the demo
// backup (a death, a PvP kill, a level-up and two achievements over two
// characters: five spotlights).
import { type Page, expect, test } from '@playwright/test';

interface Eng {
  position: number;
  playing: boolean;
  seeking: boolean;
  atEnd: boolean;
}

async function engine(page: Page): Promise<Eng> {
  return page.evaluate(() => {
    const w = window as unknown as { __wc: { shell: { playerHost: { engine: Eng } | null } } };
    const e = w.__wc.shell.playerHost!.engine;
    return { position: e.position, playing: e.playing, seeking: e.seeking, atEnd: e.atEnd };
  });
}

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const player = (page: Page) => page.locator('.wc-player');
const chrome = (page: Page) => page.locator('.wc-player-chrome');
const header = (page: Page) => chrome(page).locator('.wc-player-header');
const box = (page: Page) => page.locator('.wc-spot-box');
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-mrow[data-key="${key}"] .wc-label`);

test('Spotlights plays the reel: header, info box, ←/→, park at the end, ESC back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'spotlights').click();

  await expect(player(page)).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden();
  // Chrome hidden on entry, the info box shown.
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  await expect(box(page)).toBeVisible();
  // Newest first: Rasta's death, then Gittan (not the same character twice in a row).
  await expect(header(page)).toContainText('Rasta (L42) · SPOTLIGHT 1 / 5 · 2026-09-26');
  await expect(chrome(page).locator('.wc-player-hints')).toHaveText('ESC Back · ←→ Prev/next · 1–6 Speed');
  await expect(box(page)).toContainText('1 of 5');
  await expect(box(page)).toContainText('RASTA: Death');
  await expect(box(page).locator('.wc-spot-label')).toHaveText(['Death (level 42)', '']);
  await expect(box(page).locator('[data-nav="prev"]')).toHaveCount(0);
  await expect(box(page).locator('[data-nav="next"]')).toHaveCount(1);
  // The countdown runs toward the moment, and the text plays.
  await expect(box(page).locator('.wc-spot-bar')).toContainText('█');
  await expect(player(page).locator('.wc-output')).toContainText('You are dead!', { timeout: 15000 });
  // Box geometry: 30 cells wide, top-right, clear of the strip.
  const geo = await page.evaluate(() => {
    const b = document.querySelector('.wc-spot-box')!.getBoundingClientRect();
    const p = document.querySelector('.wc-player')!.getBoundingClientRect();
    const s = document.querySelector('.wc-player-strip')!.getBoundingClientRect();
    return { b, p, s };
  });
  expect(geo.b.right).toBeLessThan(geo.s.left);
  expect(geo.b.top).toBeGreaterThan(geo.p.top);

  // → next.
  await page.keyboard.press('ArrowRight');
  await expect(header(page)).toContainText('Gittan (L14) · SPOTLIGHT 2 / 5 · 2026-09-25');
  await expect(box(page)).toContainText('GITTAN: Achievement');
  await expect(box(page).locator('.wc-spot-label')).toHaveText(['Achievement: Put a', 'barrow-wight to rest.']);
  await expect(box(page).locator('[data-nav="prev"]')).toHaveCount(1);
  await expect(box(page).locator('[data-nav="next"]')).toHaveCount(1);
  // A key showed the chrome.
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  // Stripped down: no panes, no gear; the markers' tips name the character.
  await expect(player(page).locator('.wc-pane:visible')).toHaveCount(0);
  await expect(chrome(page).locator('.wc-player-gear')).toHaveCount(0);
  await chrome(page).locator('.wc-player-mark', { hasText: 'K►' }).hover();
  await expect(chrome(page).locator('.wc-player-tip')).toContainText(': Killed *');

  // ← at once (under 1.5 s in): the previous one.
  await page.keyboard.press('ArrowLeft');
  await expect(header(page)).toContainText('SPOTLIGHT 1 / 5');

  // ► in the box: the next one; after 2 s, ← restarts it.
  await box(page).locator('[data-nav="next"]').click();
  await expect(header(page)).toContainText('SPOTLIGHT 2 / 5');
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  await page.waitForTimeout(2000);
  await page.keyboard.press('ArrowLeft');
  await expect(header(page)).toContainText('SPOTLIGHT 2 / 5');

  // The end of the strip: it parks paused on the last spotlight; → does nothing.
  const strip = await chrome(page).locator('.wc-player-strip').boundingBox();
  await page.mouse.click(strip!.x + strip!.width / 2, strip!.y + strip!.height - 2);
  await expect.poll(async () => (await engine(page)).atEnd).toBe(true);
  expect((await engine(page)).playing).toBe(false);
  await expect(header(page)).toContainText('SPOTLIGHT 5 / 5');
  await expect(box(page)).toContainText('RASTA: Level up');
  await expect(box(page).locator('[data-nav="next"]')).toHaveCount(0);
  const end = (await engine(page)).position;
  await page.keyboard.press('ArrowRight');
  expect((await engine(page)).position).toBe(end);

  // ESC: back to the start page's main menu.
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Spotlights >>');
  expect(errors).toEqual([]);
});

test('Credits rolls the chronicle; ESC returns, and so does the end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'credits').click();
  const col = frame(page).locator('.wc-credits-col');
  await expect(col).toContainText('Ibuki');
  await expect(col).toContainText('Rasta');
  await expect(col).toContainText('Gittan');
  await expect(col).toContainText('The End.');
  await expect(frame(page).locator('.wc-credits-hint')).toHaveText('Escape to exit');
  const cellH = await page.evaluate(() => document.querySelector('.wc-credits-col .wc-line')!.getBoundingClientRect().height);
  const y0 = (await col.boundingBox())!.y;
  await page.waitForTimeout(1600);
  const y1 = (await col.boundingBox())!.y;
  expect(y0 - y1).toBeGreaterThan(cellH);
  expect(y0 - y1).toBeLessThan(cellH * 4);
  // Other keys do nothing; ESC goes back.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(col).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Credits >>');

  // The roll's end (The End. leaves the top) returns to the menu too.
  await menuRow(page, 'credits').click();
  await expect(frame(page).locator('.wc-credits-col')).toBeVisible();
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Credits >>');
  expect(errors).toEqual([]);
});

test('Options → Spotlights toggles filter the reel and Credits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'options').click();
  await frame(page).locator('.wc-mrow[data-key="spotlights"] .wc-label').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── Spotlights ───');
  const rows = frame(page).locator('.wc-mrow .wc-label');
  await expect(rows).toHaveText(['[X] Achievements', '[X] Deaths', '[X] Level-ups', '[X] PvP kills', 'Back']);
  // Enter and Space on the keyboard, a click with the mouse.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press(' ');
  await frame(page).locator('.wc-mrow[data-key="levelUps"] .wc-label').click();
  await frame(page).locator('.wc-mrow[data-key="pvp"] .wc-label').click();
  await expect(rows).toHaveText(['[ ] Achievements', '[ ] Deaths', '[ ] Level-ups', '[ ] PvP kills', 'Back']);
  const saved = await page.evaluate(
    () => (window as unknown as { __wc: { settings: { get(): { spotlights: unknown } } } }).__wc.settings.get().spotlights,
  );
  expect(saved).toEqual({ achievements: false, deaths: false, levelUps: false, pvp: false });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Options >>');

  // Spotlights: the filtered empty state; any key returns.
  await menuRow(page, 'spotlights').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── Spotlights ───');
  await expect(frame(page)).toContainText('Options → Spotlights');
  await expect(frame(page).locator('.wc-footer')).toHaveText('Any key to return');
  await expect(player(page)).toHaveCount(0);
  await page.keyboard.press('x');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Spotlights >>');

  // Credits: the same.
  await menuRow(page, 'credits').click();
  await expect(frame(page).locator('.wc-title-row')).toHaveText('─── Credits ───');
  await expect(frame(page)).toContainText('Options → Spotlights');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Credits >>');

  // Only PvP kills back on: one spotlight.
  await page.evaluate(() =>
    (window as unknown as { __wc: { settings: { update(f: (d: { spotlights: { pvp: boolean } }) => void): void } } }).__wc.settings.update(
      (d) => {
        d.spotlights.pvp = true;
      },
    ),
  );
  await menuRow(page, 'spotlights').click();
  await expect(header(page)).toContainText('Rasta (L42) · SPOTLIGHT 1 / 1');
  await expect(box(page)).toContainText('*Ibuki the Half-Elf*');
  expect(errors).toEqual([]);
});
