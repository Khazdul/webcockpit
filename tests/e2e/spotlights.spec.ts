// Stage 7 P3: Spotlights and Credits on the demo backup (a death, a PvP
// kill, a level-up and two achievements over two characters: five
// spotlights). The card's filter: spotlights-settings.spec.ts. Stage 32c
// (ADR 0114): the card, kind icons, Shift+← → 10 s.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

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
const box = (page: Page) => page.locator('.wc-spot-card');
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`);

test('Spotlights plays the reel: header, card, ←/→, Shift+←/→, park at the end, ESC back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'spotlights').click();

  await expect(player(page)).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden();
  // Chrome hidden on entry, the card shown.
  await expect(chrome(page)).toHaveAttribute('data-hidden', '');
  await expect(box(page)).toBeVisible();
  // Newest first: Rasta's death, then Gittan (not the same character twice in a row).
  await expect(header(page)).toContainText('Rasta (L42) · SPOTLIGHT 1 / 5 · 2026-09-26');
  await expect(chrome(page).locator('.wc-player-hints')).toHaveText('← → Prev/next · Shift ← → 10 s · 1–6 Speed · ESC Back');
  await expect(box(page).locator('.wc-sc-count')).toHaveText('Spotlight 1 / 5');
  await expect(box(page).locator('.wc-sc-kind')).toHaveText('Death');
  await expect(box(page).locator('.wc-sc-kind svg')).toHaveAttribute('data-kind', 'death');
  await expect(box(page).locator('.wc-sc-kind')).toHaveCSS('color', 'rgb(224, 108, 108)');
  await expect(box(page).locator('.wc-sc-label')).toHaveText('Death (level 42)');
  await expect(box(page).locator('.wc-sc-meta')).toHaveText('Rasta · 2026-09-26');
  await expect(box(page).locator('[data-nav="prev"]')).toBeDisabled();
  await expect(box(page).locator('[data-nav="next"]')).toBeEnabled();
  // The countdown runs toward the moment, and the text plays.
  await expect(box(page).locator('.wc-sc-cd i')).toBeVisible();
  await expect(player(page).locator('.wc-output')).toContainText('You are dead!', { timeout: 15000 });
  // Card geometry: top-right, clear of the rail and the header line.
  const geo = await page.evaluate(() => {
    const b = document.querySelector('.wc-spot-card')!.getBoundingClientRect();
    const p = document.querySelector('.wc-player')!.getBoundingClientRect();
    const s = document.querySelector('.wc-player-rail')!.getBoundingClientRect();
    const h = document.querySelector('.wc-player-header')!.getBoundingClientRect();
    return { b, p, s, h };
  });
  expect(geo.b.right).toBeLessThan(geo.s.left);
  expect(geo.b.top).toBeGreaterThanOrEqual(geo.h.bottom);
  expect(geo.b.width).toBe(330);

  // → next.
  await page.keyboard.press('ArrowRight');
  await expect(header(page)).toContainText('Gittan (L14) · SPOTLIGHT 2 / 5 · 2026-09-25');
  await expect(box(page).locator('.wc-sc-kind')).toHaveText('Achievement');
  await expect(box(page).locator('.wc-sc-kind svg')).toHaveAttribute('data-kind', 'achievement');
  await expect(box(page).locator('.wc-sc-label')).toHaveText('Achievement: Put a barrow-wight to rest.');
  await expect(box(page).locator('[data-nav="prev"]')).toBeEnabled();
  await expect(box(page).locator('[data-nav="next"]')).toBeEnabled();
  // A key showed the chrome.
  await expect(chrome(page)).not.toHaveAttribute('data-hidden', '');
  // Stripped down: no panes, no Panes button; Display and Close are there.
  await expect(player(page).locator('.wc-pane:visible')).toHaveCount(0);
  await expect(chrome(page).locator('[data-act="panes"]')).toHaveCount(0);
  await expect(chrome(page).locator('[data-act="display"]')).toBeVisible();
  await expect(chrome(page).locator('[data-act="close"]')).toHaveAttribute('title', 'Back to the start page (Esc)');
  // The markers are kind icons; their tips name the character.
  await expect(chrome(page).locator('.wc-player-mark')).toHaveCount(5);
  await chrome(page).locator('.wc-player-mark[data-kinds="K"]').hover();
  await expect(chrome(page).locator('.wc-player-tip')).toContainText(': Killed *');

  // ← at once (under 1.5 s in): the previous one.
  await page.keyboard.press('ArrowLeft');
  await expect(header(page)).toContainText('SPOTLIGHT 1 / 5');

  // › in the card: the next one; after 2 s, ← restarts it.
  await box(page).locator('[data-nav="next"]').click();
  await expect(header(page)).toContainText('SPOTLIGHT 2 / 5');
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  await page.waitForTimeout(2000);
  await page.keyboard.press('ArrowLeft');
  await expect(header(page)).toContainText('SPOTLIGHT 2 / 5');
  // Shift+→ / Shift+←: 10 s within the reel, not a spotlight step.
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  const p0 = (await engine(page)).position;
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await engine(page)).position - p0).toBeGreaterThanOrEqual(10_000);
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  const p1 = (await engine(page)).position;
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
  expect(Math.abs((await engine(page)).position - (p1 - 10_000))).toBeLessThan(1500);

  // The end of the rail: it parks paused on the last spotlight; → does nothing.
  const strip = await chrome(page).locator('.wc-player-rail').boundingBox();
  await page.mouse.click(strip!.x + strip!.width / 2, strip!.y + strip!.height - 2);
  await expect.poll(async () => (await engine(page)).atEnd).toBe(true);
  expect((await engine(page)).playing).toBe(false);
  await expect(header(page)).toContainText('SPOTLIGHT 5 / 5');
  await expect(box(page).locator('.wc-sc-kind')).toHaveText('Level up');
  await expect(box(page).locator('.wc-sc-kind svg')).toHaveAttribute('data-kind', 'level');
  await expect(box(page).locator('[data-nav="next"]')).toBeDisabled();
  const end = (await engine(page)).position;
  await page.keyboard.press('ArrowRight');
  expect((await engine(page)).position).toBe(end);

  // ESC: back to the start page's main menu.
  await page.keyboard.press('Escape');
  await expect(player(page)).toHaveCount(0);
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});

test('Credits rolls the chronicle; ESC returns, and so does the end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await pinDemoClock(page);
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
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Credits');

  // The roll's end (The End. leaves the top) returns to the menu too.
  await menuRow(page, 'credits').click();
  await expect(frame(page).locator('.wc-credits-col')).toBeVisible();
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Credits');
  expect(errors).toEqual([]);
});

test('the Spotlights box has Fullscreen', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await menuRow(page, 'spotlights').click();
  await expect(player(page)).toBeVisible();
  const fs = chrome(page).locator('.wc-player-box [data-act="extra"]');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  await page.mouse.move(400, 400);
  await page.mouse.move(420, 420);
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
});
