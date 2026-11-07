// Stage 7 P3: Spotlights on the demo backup (a death, a PvP
// kill, a level-up and two achievements over two characters: five
// spotlights). Stage 46 (ADR 0131, B "Galleriet"): Spotlights opens on a
// wall of cards in the large box; a card plays in the viewer that grows out
// of it (the embedded bare player with the page's head, track and
// controls), plays on through the rest, ends on an end card, and Esc goes
// back to the wall with the current card chosen. The filter row:
// spotlights-settings.spec.ts; the phone: phone-spotlights.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';

interface Eng {
  position: number;
  playing: boolean;
  seeking: boolean;
  atEnd: boolean;
  speed: number;
  duration: number;
}

/** The open player's engine (the viewer's embedded host); a stand-in until the host is ready. */
async function engine(page: Page): Promise<Eng> {
  return page.evaluate(() => {
    const w = window as unknown as { __wc: { shell: { playerHost: { engine: Eng | null } | null } } };
    const e = w.__wc.shell.playerHost?.engine;
    if (!e) return { position: -1, playing: false, seeking: true, atEnd: false, speed: 0, duration: 0 };
    return { position: e.position, playing: e.playing, seeking: e.seeking, atEnd: e.atEnd, speed: e.speed, duration: e.duration };
  });
}

/** Waits until a seek has landed. */
async function settled(page: Page): Promise<void> {
  await expect.poll(async () => (await engine(page)).seeking).toBe(false);
}

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

const frame = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden])');
const menuRow = (page: Page, key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"]`);
const wall = (page: Page) => frame(page).locator('.wc-spw');
const cards = (page: Page) => wall(page).locator('.wc-spw-card');
const chosen = (page: Page) => wall(page).locator('.wc-spw-card.is-on');
const viewer = (page: Page) => page.locator('.wc-spv');
const count = (page: Page) => viewer(page).locator('.wc-spv-count');
const navBtn = (page: Page, id: 'prev' | 'next') => viewer(page).locator(`.wc-spv-nav [data-btn="${id}"]`);
const ctl = (page: Page, act: string) => viewer(page).locator(`.wc-spv-ctl [data-act="${act}"]`);
const endCard = (page: Page) => viewer(page).locator('.wc-spv-end');

/** Start page → Spotlights: the wall with its five cards. */
async function openWall(page: Page): Promise<void> {
  await menuRow(page, 'spotlights').click();
  await expect(cards(page)).toHaveCount(5);
}

test('Spotlights opens on the wall; a card plays in the viewer: ←/→, Shift+←/→, speed, pause, the end card, Esc back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openWall(page);

  // The wall in the large box: newest first, Rasta's death, then Gittan (not the same character twice in a row).
  await expect(wall(page).locator('.wc-lk-hood-t')).toHaveText('Spotlights');
  await expect(cards(page).locator('.wc-spw-label')).toHaveText([
    'Death (level 42)',
    'Achievement: Put a barrow-wight to rest.',
    '*Ibuki the Half-Elf*',
    'Achievement: That was a quick trip!',
    'Reached level 42',
  ]);
  await expect(cards(page).locator('.wc-spw-kind')).toHaveText(['Death', 'Achievement', 'PvP kill', 'Achievement', 'Level up']);
  await expect(cards(page).first().locator('.wc-spw-kind')).toHaveCSS('color', 'rgb(224, 108, 108)');
  await expect(cards(page).first().locator('.wc-spw-meta')).toHaveText('Rasta · level 42 · 26 Sep 2026');
  await expect(cards(page).nth(1).locator('.wc-spw-meta')).toHaveText('Gittan · level 14 · 25 Sep 2026');
  // Each card's still: the last visible lines before the moment.
  await expect(cards(page).first().locator('.wc-spw-ln')).toHaveCount(4);
  await expect(cards(page).first().locator('.wc-spw-ln').last()).toContainText('You are dead!');
  await expect(chosen(page)).toHaveAttribute('data-kind', 'death');
  await expect(wall(page).locator('.wc-spw-sum')).toHaveText(/^5 spotlights · \d\d:\d\d$/);
  // The start page owns no player while the wall shows.
  expect(await page.evaluate(() => (window as unknown as { __wc: { shell: { playerHost: unknown } } }).__wc.shell.playerHost)).toBeNull();

  // Enter plays the chosen card: the viewer's head, ‹ 1 / 5 ›, and the text plays.
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toBeVisible();
  const head = viewer(page).locator('.wc-spv-head');
  await expect(head.locator('.wc-spv-kind')).toHaveText('Death');
  await expect(head.locator('.wc-spv-kind')).toHaveCSS('color', 'rgb(224, 108, 108)');
  await expect(head.locator('.wc-spv-label')).toHaveText('Death (level 42)');
  await expect(head.locator('.wc-spv-meta')).toHaveText('Rasta · level 42 · Saturday 26 September 2026');
  await expect(count(page)).toHaveText('1 / 5');
  await expect(navBtn(page, 'prev')).toHaveAttribute('aria-disabled', 'true');
  await expect(navBtn(page, 'prev')).toHaveAttribute('title', 'Previous spotlight (←)');
  await expect(navBtn(page, 'next')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(navBtn(page, 'next')).toHaveAttribute('title', 'Next spotlight (→)');
  await expect(viewer(page).locator('.wc-output')).toContainText('You are dead!', { timeout: 15000 });
  // The game text only (ADR 0032): no panes, no player chrome of its own.
  await expect(viewer(page).locator('.wc-pane:visible')).toHaveCount(0);
  await expect(viewer(page).locator('.wc-player-header, .wc-player-rail, .wc-player-box')).toHaveCount(0);
  // The track: one kind marker per spotlight; a tip names the character.
  await expect(viewer(page).locator('.wc-spv-mk')).toHaveCount(5);
  await viewer(page).locator('.wc-spv-mk[data-kind="pkill"]').hover();
  await expect(viewer(page).locator('.wc-spv-trk-tip')).toContainText('Rasta: Killed *Ibuki the Half-Elf*');
  await expect(ctl(page, 'play')).toHaveAttribute('aria-label', 'Pause');
  await expect(viewer(page).locator('.wc-spv-clock')).toHaveText(/^\d\d:\d\d \/ \d\d:\d\d$/);

  // → next.
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('2 / 5');
  await expect(head.locator('.wc-spv-kind')).toHaveText('Achievement');
  await expect(head.locator('.wc-spv-label')).toHaveText('Achievement: Put a barrow-wight to rest.');
  await expect(navBtn(page, 'prev')).not.toHaveAttribute('aria-disabled', 'true');
  // ← at once (under 1.5 s in): the previous one.
  await page.keyboard.press('ArrowLeft');
  await expect(count(page)).toHaveText('1 / 5');
  // › in the head: the next one; after 2 s, ← restarts it.
  await navBtn(page, 'next').click();
  await expect(count(page)).toHaveText('2 / 5');
  await settled(page);
  await page.waitForTimeout(2000);
  await page.keyboard.press('ArrowLeft');
  await settled(page);
  await expect(count(page)).toHaveText('2 / 5');

  // Shift+→ / Shift+←: 10 s within the reel, not a spotlight step.
  const p0 = (await engine(page)).position;
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await engine(page)).position - p0).toBeGreaterThanOrEqual(10_000);
  await settled(page);
  const p1 = (await engine(page)).position;
  await page.keyboard.press('Shift+ArrowLeft');
  await settled(page);
  expect(Math.abs((await engine(page)).position - (p1 - 10_000))).toBeLessThan(1500);

  // 1–6: the speed (0.25 … 8×), shown in the speed well.
  await page.keyboard.press('4');
  await expect.poll(async () => (await engine(page)).speed).toBe(2);
  await expect(viewer(page).locator('.wc-spv-spd-v')).toHaveText('2×');
  await page.keyboard.press('3');
  await expect.poll(async () => (await engine(page)).speed).toBe(1);
  await expect(viewer(page).locator('.wc-spv-spd-v')).toHaveText('1×');

  // Space pauses: the cursor line; ↑ moves it; Space resumes from it.
  await page.keyboard.press(' ');
  await expect.poll(async () => (await engine(page)).playing).toBe(false);
  await expect(ctl(page, 'play')).toHaveAttribute('aria-label', 'Play');
  const cursor = viewer(page).locator('.wc-player-cursor');
  await expect(cursor).toHaveCount(1);
  const rowOf = () =>
    page.evaluate(() => {
      const c = document.querySelector('.wc-spv .wc-player-cursor')!;
      return [...c.parentElement!.children].indexOf(c);
    });
  const r0 = await rowOf();
  const paused = (await engine(page)).position;
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect.poll(rowOf).toBeLessThan(r0);
  await page.keyboard.press(' ');
  await expect.poll(async () => (await engine(page)).playing).toBe(true);
  await settled(page);
  expect((await engine(page)).position).toBeLessThanOrEqual(paused + 500);
  await expect(ctl(page, 'play')).toHaveAttribute('aria-label', 'Pause');

  // The end of the track: the end card; → does nothing on the last.
  const line = (await viewer(page).locator('.wc-spv-trk-line').boundingBox())!;
  await page.mouse.click(line.x + line.width - 1, line.y + line.height / 2);
  await expect.poll(async () => (await engine(page)).atEnd, { timeout: 15000 }).toBe(true);
  await expect(endCard(page)).toBeVisible();
  await expect(endCard(page).locator('.wc-spv-end-t')).toHaveText('End of the reel');
  await expect(endCard(page).locator('.wc-spv-end-n')).toHaveText('5 of 5');
  await expect(count(page)).toHaveText('5 / 5');
  await expect(head.locator('.wc-spv-kind')).toHaveText('Level up');
  await expect(navBtn(page, 'next')).toHaveAttribute('aria-disabled', 'true');
  expect((await engine(page)).playing).toBe(false);
  const end = (await engine(page)).position;
  await page.keyboard.press('ArrowRight');
  expect((await engine(page)).position).toBe(end);
  await expect(endCard(page)).toBeVisible();

  // P: Play again, from the first.
  await page.keyboard.press('p');
  await expect(endCard(page)).toHaveCount(0);
  await expect(count(page)).toHaveText('1 / 5');
  await expect.poll(async () => (await engine(page)).playing).toBe(true);

  // On to the third; Esc shrinks back into its card on the wall.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('3 / 5');
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(chosen(page)).toHaveCount(1);
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('*Ibuki the Half-Elf*');
  // The host stays alive (parked, paused) while the page is open.
  expect((await engine(page)).playing).toBe(false);

  // Esc again: the start page's menu; the host goes with the page.
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __wc: { shell: { playerHost: unknown } } }).__wc.shell.playerHost))
    .toBeNull();
  expect(errors).toEqual([]);
});

test('the Spotlights viewer has Fullscreen; Back leaves the viewer, then the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openWall(page);
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toBeVisible();
  const fs = ctl(page, 'fullscreen');
  await expect(fs).toHaveAttribute('aria-label', 'Fullscreen');
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(fs).toHaveAttribute('aria-label', 'Exit fullscreen');
  await fs.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  // The box's Back leaves the viewer (as Esc does), then the page.
  await frame(page).locator('.wc-lk-back').first().click();
  await expect(viewer(page)).toHaveCount(0);
  await expect(chosen(page)).toHaveAttribute('data-kind', 'death');
  await frame(page).locator('.wc-lk-back').first().click();
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Spotlights');
  expect(errors).toEqual([]);
});

test('mouse on the wall: a click chooses, a double click plays; P plays all; the host is kept for the next card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openWall(page);
  await cards(page).nth(2).click();
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('*Ibuki the Half-Elf*');
  await expect(viewer(page)).toHaveCount(0);
  await cards(page).nth(3).dblclick();
  await expect(viewer(page)).toBeVisible();
  await expect(count(page)).toHaveText('4 / 5');
  await expect(viewer(page).locator('.wc-spv-label')).toHaveText('Achievement: That was a quick trip!');
  await expect.poll(async () => (await engine(page)).playing).toBe(true);
  const host = await page.evaluateHandle(() => (window as unknown as { __wc: { shell: { playerHost: unknown } } }).__wc.shell.playerHost);
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(chosen(page).locator('.wc-spw-label')).toHaveText('Achievement: That was a quick trip!');
  // P: Play all, from the first, on the same host.
  await page.keyboard.press('p');
  await expect(viewer(page)).toBeVisible();
  await expect(count(page)).toHaveText('1 / 5');
  await expect.poll(async () => (await engine(page)).playing).toBe(true);
  expect(await page.evaluate((h) => (window as unknown as { __wc: { shell: { playerHost: unknown } } }).__wc.shell.playerHost === h, host)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(chosen(page)).toHaveAttribute('data-kind', 'death');
  expect(errors).toEqual([]);
});

test('ANSI red is drawn brighter on the dark wells with the Default colours; a chosen theme keeps its own', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await page.goto('/');
  await restoreDemo(page);
  await openWall(page);
  const RED = 'rgb(196, 60, 60)';
  // The still: the troll's hits in ANSI 31.
  await expect(cards(page).first().locator('.wc-spw-ln span').first()).toHaveCSS('color', RED);
  await page.keyboard.press('Enter');
  const out = viewer(page).locator('.wc-output');
  await expect(out).toContainText('You are dead!', { timeout: 15000 });
  const hit = out.locator('span', { hasText: 'A stone-troll crushes you' }).first();
  await expect(hit).toHaveCSS('color', RED);
  // D: Display; ↓ the colours, → Dark: the theme's own red.
  await page.keyboard.press('d');
  const pop = page.locator('.wc-spv-dp');
  await expect(pop).toBeVisible();
  await expect(pop.locator('[data-theme]')).toHaveText(['Default', 'Dark', 'Teal', 'Paper', 'Sepia', 'Slate']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(pop.locator('[data-theme="dark"]')).toHaveAttribute('aria-checked', 'true');
  await expect(hit).not.toHaveCSS('color', RED);
  // ← back to Default: the brighter red again; Esc closes Display, not the viewer.
  await page.keyboard.press('ArrowLeft');
  await expect(hit).toHaveCSS('color', RED);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(viewer(page)).toBeVisible();
  // Dark again, then back to the wall: the stills follow the viewer's theme (its own red, its background).
  await page.keyboard.press('d');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(pop.locator('[data-theme="dark"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  const still = cards(page).first().locator('.wc-spw-ln span').first();
  await expect(still).toHaveCSS('color', 'rgb(128, 0, 0)');
  await expect(cards(page).first().locator('.wc-spw-still')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  // Default again (the kept host still has Dark): the brighter red in the stills too.
  await page.keyboard.press('Enter');
  await expect(viewer(page).locator('.wc-spv-ctl [data-btn="display"]')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('d');
  await expect(pop.locator('[data-theme="dark"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await expect(pop.locator('[data-theme="default"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(still).toHaveCSS('color', RED);
});
