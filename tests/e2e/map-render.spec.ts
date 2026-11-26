// Stage 9 P1 (ADR 0020): the WebGL2 renderer draws arda.mm2 in MMapper's
// look. The test drives the worker with the development-only
// `debugScene` message (no tracking needed): it centres on the room of
// the owner's reference screenshot (Orc Sleeping Warrens, the rent room
// at 451,-84,0), puts the player there and checks a few pixels.
//
// WC_MAP_SHOT_DIR=<dir> also saves screenshots at the reference zoom,
// 0.1 and 5.
import { expect, type Page, test } from '@playwright/test';

const SHOT_DIR = process.env.WC_MAP_SHOT_DIR;
/** Room index of "Orc Sleeping Warrens" (451, -84, 0) in the bundled arda.mm2. */
const RENT_ROOM = 7636;
/** The owner's screenshot shows about 51 px per room: zoom 51/44. */
const REF_ZOOM = 51 / 44;

async function openMap(page: Page): Promise<void> {
  // Keep a handle on the map worker so the test can post to it.
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
  // The boxes: this file is the renderer's reference without tokens (stage 80 part B; looks-map-tokens.spec.ts has them).
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } }, mapper: { tokens: false } }));
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
}

interface Extra {
  /** The player's room (default: the rent room). */
  player?: number;
  /** The view centre (default: the player's room). */
  center?: { room: number } | { x: number; y: number; z: number };
  path?: number[];
  members?: { id: number; room: number | null; text: string; color: number; npc: boolean }[];
}

async function debugScene(page: Page, zoom: number, extra: Extra = {}): Promise<void> {
  await page.evaluate(
    ([room, z, x]) => {
      const w = (window as unknown as { __mapWorkers: Worker[] }).__mapWorkers[0]!;
      w.postMessage({
        t: 'debugScene',
        scene: { room: x.player ?? room, located: true, color: 0xffff00, path: x.path ?? [], members: x.members ?? [] },
        center: x.center ?? { room: x.player ?? room },
        zoom: z,
      });
    },
    [RENT_ROOM, zoom, extra] as const,
  );
  // Tiles and the font load asynchronously; give the worker a moment to redraw.
  await page.waitForTimeout(1500);
}

test('map renderer: MMapper tiles, player marker, far and near zoom', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openMap(page);
  await debugScene(page, REF_ZOOM);
  const canvas = page.locator('.wc-pane-map canvas');
  const box = (await canvas.boundingBox())!;

  // Read pixels from a screenshot through a 2D canvas in the page. Tiles
  // arrive asynchronously (the worker redraws when they do), so poll.
  const measure = async () => {
    const shot = await canvas.screenshot();
    return page.evaluate(async (png) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const at = (x: number, y: number) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      const w = img.width;
      const h = img.height;
      const colours = new Set<string>();
      for (let y = 0; y < h; y += 7) for (let x = 0; x < w; x += 7) colours.add(at(x, y).slice(0, 3).join(','));
      // The yellow player square around the centre room.
      let yellow = 0;
      for (let dy = -26; dy <= 26; dy++) {
        for (let dx = -26; dx <= 26; dx++) {
          const [r, g2, b] = at(w / 2 + dx, h / 2 + dy);
          if (r! > 200 && g2! > 200 && b! < 80) yellow++;
        }
      }
      return { w, colours: colours.size, yellow };
    }, shot.toString('base64'));
  };
  // Not a uniform background (tiles of many colours), and the player square around the centre is yellow.
  await expect.poll(async () => { const m = await measure(); return m.colours > 50 && m.yellow > 40; }, { timeout: 15_000 }).toBe(true);
  expect((await measure()).w).toBeGreaterThan(Math.floor(box.width) - 2);
  await canvas.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/p1-map-${info.project.name}.png` : undefined });

  // Path ahead and group mates: one in your room (rotated), one labelled
  // nearby, one off screen (edge arrow + label).
  await debugScene(page, REF_ZOOM, {
    path: [7638, 7639, 7541],
    members: [
      { id: 1, room: RENT_ROOM, text: 'Mate', color: 0x00c0ff, npc: false },
      { id: 2, room: 7542, text: 'Scout', color: 0xff40a0, npc: false },
      { id: 3, room: 0, text: 'Faraway', color: 0x40ff40, npc: false },
    ],
  });
  await canvas.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/p1-map-scene-${info.project.name}.png` : undefined });

  // Layers: the Carrock (layer 1) over its surroundings on layer 0, seen
  // from layer 1 (lower layer dimmed) and from layer 0 (upper layer
  // untextured, the player's other-layer arrow).
  const CARROCK = 16814;
  await debugScene(page, 1, { player: CARROCK });
  await canvas.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/p1-map-layer1-${info.project.name}.png` : undefined });
  await debugScene(page, 1, { player: CARROCK, center: { x: 494.5, y: -57.5, z: 0 } });
  await canvas.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/p1-map-layer0-${info.project.name}.png` : undefined });

  for (const [zoom, name] of [
    [0.1, 'far'],
    [5, 'zoom5'],
  ] as const) {
    await debugScene(page, zoom);
    const s = await canvas.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/p1-map-${name}-${info.project.name}.png` : undefined });
    expect(s.byteLength).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test.describe('at device pixel ratio 2', () => {
  test.use({ deviceScaleFactor: 2 });

  test('map renderer: zoom 1 at DPR 2 (the owner reference: Cantarell 36)', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openMap(page);
    await debugScene(page, 1);
    const canvas = page.locator('.wc-pane-map canvas');
    const shot = await canvas.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/p1-map-dpr2-${info.project.name}.png` : undefined });
    expect(shot.byteLength).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
