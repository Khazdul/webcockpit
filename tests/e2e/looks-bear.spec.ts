// Bear form (stage 80 part A, ADR 0169): the three Char.StatusVars messages
// of the owner's run with Dubb, a Beorning (2026-11-26), and the portrait
// that follows them, and (part B) your token on the map, which changes with
// the form as the portrait does. Uses the dev-only `window.__wc`, the GMCP
// demo and the map worker's `debugScene` (map-render.spec.ts).
import { type Page, expect, test } from '@playwright/test';

const disc = (page: Page) => page.locator('.wc-pane-character .wc-cc-disc');
const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);
const photo = (page: Page) => disc(page).locator('img.wc-cc-photo').getAttribute('src');
/**
 * The portrait once it has settled: under load the pane may still resize
 * after the first bake (the bake follows the frame's size), so a picture
 * counts only when it is the same twice, half a second apart.
 */
async function settled(page: Page): Promise<string | null> {
  let last = await photo(page);
  await expect
    .poll(async () => {
      await page.waitForTimeout(500);
      const now = await photo(page);
      const same = now === last;
      last = now;
      return same;
    }, { timeout: 15_000 })
    .toBe(true);
  return last;
}

test('the Beorning becomes the bear and the Beorning again', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/?fixture=gmcp-demo.log&speed=0');
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true } }, character: { height: 'auto' } }));
  await expect.poll(() => page.evaluate(() => window.__wc!.app.game.char.view().name)).toBe('Rasta');
  await emit(page, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
  await expect(disc(page)).toHaveAttribute('data-portrait', 'beorning');
  await expect(disc(page)).toHaveAttribute('data-art', 'drawn');
  const man = await settled(page);
  await emit(page, 'Char.StatusVars', { race: 'Bear', subrace: null });
  await expect(disc(page)).toHaveAttribute('data-portrait', 'bear');
  await expect.poll(() => photo(page)).not.toBe(man);
  // The race line says what MUME says; the sex is kept.
  await expect(disc(page)).toHaveAttribute('data-sex', 'male');
  await emit(page, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
  await expect(disc(page)).toHaveAttribute('data-portrait', 'beorning');
  await expect.poll(() => photo(page), { timeout: 15_000 }).toBe(man);
});

test('the token on the map changes with the form too', async ({ page }) => {
  await page.addInitScript(() => {
    const Base = window.Worker;
    const list: Worker[] = [];
    (window as unknown as { __mapWorkers: Worker[] }).__mapWorkers = list;
    window.Worker = class extends Base {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        if (opts?.name === 'map') list.push(this);
      }
    };
  });
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/?replay');
  await page.waitForFunction(() => window.__wc?.app !== undefined);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await emit(page, 'Char.Name', { name: 'Dubb', fullname: 'Dubb the Beorning' });
  await emit(page, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
  // You alone in the Orc Sleeping Warrens (map-render.spec.ts), at zoom 2.
  await page.evaluate(() => {
    const w = (window as unknown as { __mapWorkers: Worker[] }).__mapWorkers[0]!;
    w.postMessage({ t: 'debugScene', scene: { room: 7636, located: true, color: 0xffff00, path: [], members: [] }, center: { room: 7636 }, zoom: 2 });
  });
  await expect(content).toHaveAttribute('data-map-self-look', 'drawn:beorning:male');
  await expect.poll(() => content.getAttribute('data-map-tokens')).toBe('1/0/0');
  const canvas = page.locator('.wc-pane-map canvas');
  const token = async () => {
    const b = (await canvas.boundingBox())!;
    return (await page.screenshot({ clip: { x: b.x + b.width / 2 - 30, y: b.y + b.height / 2 - 30, width: 60, height: 60 } })).toString('base64');
  };
  await page.waitForTimeout(1500); // the bake and the upload
  const man = await token();
  await emit(page, 'Char.StatusVars', { race: 'Bear', subrace: null });
  await expect(content).toHaveAttribute('data-map-self-look', 'drawn:bear:male');
  await expect.poll(token, { timeout: 10_000 }).not.toBe(man);
  await emit(page, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
  await expect(content).toHaveAttribute('data-map-self-look', 'drawn:beorning:male');
  await expect.poll(token, { timeout: 10_000 }).toBe(man);
});
