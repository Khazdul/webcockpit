// Map tokens (stage 80 part B, ADR 0171): you and the group members as
// round tokens at 20 CSS px a room and more, the fan for several in one
// room, the HP arc, the switch back to today's boxes. The group comes in by
// GMCP emitted on the app bus (the main thread's GroupTable, the looks and
// the HP), the rooms by the worker's development-only `debugScene` (as
// map-render.spec.ts), matched by the Group.* ids. The worker reports what
// it drew in `data-map-tokens` (tokens/plus discs/arcs).
//
// WC_MAP_SHOT_DIR=<dir> also saves the canvas at each step.
import { expect, type Page, test } from '@playwright/test';

const SHOT_DIR = process.env.WC_MAP_SHOT_DIR;
/** "Orc Sleeping Warrens" (451, -84, 0) in the bundled arda.mm2 (map-render.spec.ts). */
const RENT_ROOM = 7636;
const CONTENT = '.wc-pane-map .wc-pane-content';

const emit = (page: Page, pkg: string, data: unknown) =>
  page.evaluate(([p, d]) => window.__wc!.app.bus.emit('gmcp', { pkg: p as string, key: (p as string).toLowerCase(), data: d }), [pkg, data] as const);

async function openMap(page: Page): Promise<void> {
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
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  await expect(page.locator(CONTENT)).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
}

const vit = (hp: number, max = 100) => ({ hp, maxhp: max, 'hp-string': '', mana: 50, maxmana: 50, mp: 80, maxmp: 80 });
/** You (Rasta, a Dúnadan) and eight members: ids 2–9. */
async function group(page: Page, hurt: Record<number, number> = {}): Promise<void> {
  await emit(page, 'Char.Name', { name: 'Rasta', fullname: 'Rasta the Wanderer' });
  await emit(page, 'Char.StatusVars', { name: 'Rasta', race: 'Man', subrace: 'Dunadan' });
  await emit(page, 'Char.Vitals', { hp: 50, maxhp: 100 });
  const names = ['Thorin', 'Eowyn', 'Glorfindel', 'a trained horse', 'Bilbo', 'Strider', 'Faramir', 'Gimli'];
  await emit(page, 'Group.Set', [
    { id: 1, type: 'you', name: 'Rasta', label: 0, ...vit(50) },
    ...names.map((name, i) => {
      const id = i + 2;
      const npc = name.startsWith('a ');
      return { id, type: npc ? 'npc' : 'ally', name, label: npc ? 'HORSE' : 0, ...vit(hurt[id] ?? 100) };
    }),
  ]);
}

type M = { id: number; room: number | null };
async function debugScene(page: Page, zoom: number, members: M[], player = RENT_ROOM): Promise<void> {
  await page.evaluate(
    ([room, z, ms, centre]) => {
      const w = (window as unknown as { __mapWorkers: Worker[] }).__mapWorkers[0]!;
      w.postMessage({
        t: 'debugScene',
        scene: { room, located: true, color: 0xffff00, path: [], members: ms.map((m) => ({ ...m, text: `M${m.id}`, color: 0x808080, npc: false })) },
        center: { room: centre },
        zoom: z,
      });
    },
    [player, zoom, members, RENT_ROOM] as const,
  );
}

const drawn = (page: Page) => page.locator(CONTENT).getAttribute('data-map-tokens');

/** Pixels of a colour family within `r` px of the canvas centre. */
async function near(page: Page, r: number, kind: 'red' | 'yellow'): Promise<number> {
  const shot = await page.locator('.wc-pane-map canvas').screenshot();
  return page.evaluate(
    async ([png, rad, k]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const cx = img.width / 2;
      const cy = img.height / 2;
      let n = 0;
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
        for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
          const i = (y * img.width + x) * 4;
          const [R, G, B] = [d[i]!, d[i + 1]!, d[i + 2]!];
          if (k === 'red' ? R > 220 && G > 50 && G < 120 && B > 50 && B < 120 : R > 200 && G > 200 && B < 80) n++;
        }
      }
      return n;
    },
    [shot.toString('base64'), r, kind] as const,
  );
}

const shot = (page: Page, name: string, project: string) =>
  SHOT_DIR ? page.locator('.wc-pane-map canvas').screenshot({ path: `${SHOT_DIR}/tokens-${name}-${project}.png` }) : Promise.resolve();

test('tokens at zoom 1, the fan with +1, boxes below 20 px a room and with the switch off', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openMap(page);
  await group(page, { 3: 60, 6: 20 });
  // Five in your room (you and 2–5), 6 and 7 a few rooms away, 8 off the screen, 9 nowhere.
  const members: M[] = [
    { id: 2, room: RENT_ROOM },
    { id: 3, room: RENT_ROOM },
    { id: 4, room: RENT_ROOM },
    { id: 5, room: RENT_ROOM },
    { id: 6, room: 7542 },
    { id: 7, room: 7638 },
    { id: 8, room: 0 },
    { id: 9, room: null },
  ];
  await debugScene(page, 1, members);
  // You, three small ones, 6, 7 and 8 are tokens, one +1 disc (5 behind it); arcs on you (50 %), 3 and 6.
  await expect.poll(() => drawn(page), { timeout: 15_000 }).toBe('7/1/3');
  await expect(page.locator(CONTENT)).toHaveAttribute('data-map-self-look', 'drawn:dunadan:male');
  // Today's yellow box is gone from the centre (the yellow ring is 1 px, muted).
  await expect.poll(() => near(page, 26, 'yellow'), { timeout: 10_000 }).toBeLessThan(40);
  await page.waitForTimeout(1500); // the pictures
  await shot(page, 'fan', info.project.name);

  // 19.4 px a room: the boxes.
  await debugScene(page, 0.44, members);
  await expect.poll(() => drawn(page)).toBe('0/0/0');
  await page.waitForTimeout(1500);
  await shot(page, 'below20', info.project.name);
  // 20.2 px: tokens again.
  await debugScene(page, 0.46, members);
  await expect.poll(() => drawn(page)).toBe('7/1/3');

  // Alone, at zoom 1: you alone (an arc at 50 %).
  await debugScene(page, 1, []);
  await expect.poll(() => drawn(page)).toBe('1/0/1');
  await page.waitForTimeout(1500);
  await shot(page, 'alone', info.project.name);

  // A hurt member (20 %: red) alone in the centre, you far away: an arc; a healthy one: none.
  await debugScene(page, 2, [{ id: 6, room: RENT_ROOM }], 0);
  await expect.poll(() => drawn(page)).toBe('2/0/2');
  await expect.poll(() => near(page, 60, 'red'), { timeout: 10_000 }).toBeGreaterThan(30);
  await shot(page, 'hurt', info.project.name);
  await debugScene(page, 2, [{ id: 7, room: RENT_ROOM }], 0);
  await expect.poll(() => drawn(page)).toBe('2/0/1');
  await expect.poll(() => near(page, 60, 'red'), { timeout: 10_000 }).toBe(0);
  await page.waitForTimeout(1000);
  expect(await near(page, 60, 'red')).toBe(0);

  // The HP arc's switch: no arcs.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tokenHp: false } }));
  await debugScene(page, 1, members);
  await expect.poll(() => drawn(page)).toBe('7/1/0');
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tokenHp: true } }));

  // The switch off: today's boxes, the yellow square in the centre.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tokens: false } }));
  await debugScene(page, 1, members);
  await expect.poll(() => drawn(page)).toBe('0/0/0');
  await expect.poll(() => near(page, 26, 'yellow'), { timeout: 10_000 }).toBeGreaterThan(40);
  await shot(page, 'off', info.project.name);
  expect(errors).toEqual([]);
});
