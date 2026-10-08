// Stage 22 (ADR 0082) and 26 (ADR 0088): map tilesets. Options → Mapper picks a set; the
// Map pane fetches that set's files (the default pixmaps only for files
// the set lacks), swaps the tiles live, and an alternating set follows a
// mocked game clock's season. An HTML replay embeds the client's set.
// A community set switches the map background to white and choosing
// Default again restores the user's colour.
//
// WC_MAP_SHOT_DIR=<dir> saves screenshots of the default, Desert and a
// Shimrod season at the same spot.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, type Page, type Request, test } from '@playwright/test';
import { momentSeconds } from '../../src/gmcp/clock';
import { readMm2 } from '../../src/map/mm2';
import { gmcpLine } from '../unit/map-grid';
import { decodePayload } from '../../src/replay/codec';
import { TILESETS } from '../../src/map/tilesets';
import { RENDERER_PIXMAPS } from '../../src/map/render/textures';

const SHOT_DIR = process.env.WC_MAP_SHOT_DIR;
const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));
/** "Orc Sleeping Warrens" (the rent room) in arda.mm2: mob and load icons, trails, walls. */
const RENT_ROOM = 7636;

/** Map tile requests, as paths under `/map/` (`pixmaps/x.png`, `tilesets/desert/x.png`). */
function trackTiles(page: Page): string[] {
  const seen: string[] = [];
  const on = (r: Request) => {
    const m = /\/map\/((?:pixmaps|tilesets)\/[^?]+)$/.exec(r.url());
    if (m) seen.push(decodeURIComponent(m[1]!));
  };
  page.context().on('request', on);
  return seen;
}

/** Keeps a handle on the map worker (debugScene). */
async function grabWorker(page: Page): Promise<void> {
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
}

/** A saved game clock whose "now" is in MUME month `month` (0–11). */
async function mockClock(page: Page, month: number): Promise<void> {
  await page.addInitScript((sec) => {
    const nowS = Math.floor(Date.now() / 1000);
    localStorage.setItem('wc.clock', JSON.stringify({ epoch: nowS - sec, precision: 'minute', lastSync: nowS - 5, reason: 'e2e' }));
  }, momentSeconds(3000, month, 15, 12, 0));
}

async function openOptionsMapper(page: Page) {
  await page.locator('.wc-input-field').focus();
  await page.keyboard.press('Escape');
  const frame = page.locator('.wc-frame:not([hidden])');
  await frame.locator('.wc-mrow[data-key="options"] .wc-label').click();
  await frame.locator('.wc-mrow[data-key="mapper"] .wc-label').click();
  return frame;
}

async function scene(page: Page, zoom: number): Promise<void> {
  await page.evaluate(
    ([room, z]) => {
      const w = (window as unknown as { __mapWorkers: Worker[] }).__mapWorkers[0]!;
      w.postMessage({ t: 'debugScene', scene: { room, located: true, color: 0xffff00, path: [], members: [] }, center: { room }, zoom: z });
    },
    [RENT_ROOM, zoom] as const,
  );
}

/**
 * A coarse fingerprint of the canvas (sampled red and green), to tell
 * tilesets apart, and the yellow pixels of the player square within
 * `half` px of the centre.
 */
async function sample(page: Page, half = 70): Promise<{ fp: number[]; yellow: number }> {
  const shot = await page.locator('.wc-pane-map canvas').screenshot();
  return page.evaluate(
    async ([png, h]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const w = img.width;
      const d = g.getImageData(0, 0, w, img.height).data;
      const fp: number[] = [];
      for (let y = 8; y < img.height; y += 16) for (let x = 8; x < w; x += 16) fp.push(d[(y * w + x) * 4]!, d[(y * w + x) * 4 + 1]!);
      let yellow = 0;
      const cx = Math.floor(w / 2);
      const cy = Math.floor(img.height / 2);
      for (let y = Math.max(0, cy - h); y < Math.min(img.height, cy + h); y++) {
        for (let x = Math.max(0, cx - h); x < Math.min(w, cx + h); x++) {
          const o = (y * w + x) * 4;
          if (d[o]! > 200 && d[o + 1]! > 200 && d[o + 2]! < 80) yellow++;
        }
      }
      return { fp, yellow };
    },
    [shot.toString('base64'), half] as const,
  );
}

/**
 * The canvas fingerprint once the scene is drawn (the player's yellow
 * square at the centre, many colours) and three samples about 0.5 s
 * apart agree. Each sample sets the scene again: headless Chromium can
 * show an earlier on-demand frame for a while.
 */
async function settled(page: Page, zoom = 2): Promise<number[]> {
  const samples: number[][] = [];
  await expect
    .poll(
      async () => {
        await scene(page, zoom);
        await page.waitForTimeout(500);
        const s = await sample(page, Math.round(25 * zoom + 10));
        samples.push(s.yellow > 30 ? s.fp : []);
        const [a, b, c] = samples.slice(-3);
        return !!a && !!b && !!c && c.length > 0 && diff(a, b) === 0 && diff(b, c) === 0 && new Set(c).size > 20;
      },
      { timeout: 30_000, intervals: [0] },
    )
    .toBe(true);
  return samples.at(-1)!;
}

const diff = (a: number[], b: number[]): number =>
  a.length !== b.length || a.length === 0 ? 1 : a.reduce((n, v, i) => n + (Math.abs(v - b[i]!) > 24 ? 1 : 0), 0) / a.length;

const setOf = (id: string) => TILESETS.find((t) => t.id === id)!;

/** Every renderer pixmap, as the path it must be fetched from under set `id` (an alias: the set's own file, ADR 0088). */
function expectedPaths(id: string): string[] {
  const t = setOf(id);
  const paths = RENDERER_PIXMAPS.map((p) => {
    const f = p.slice('pixmaps/'.length);
    const alias = t.aliases?.[f];
    if (alias) return `tilesets/${t.dir}/${alias}`;
    return t.lacks.includes(f) ? p : `tilesets/${t.dir}/${f}`;
  });
  return [...new Set(paths)].sort();
}

test('Options → Mapper: a tileset is fetched (only its files), drawn and swapped live', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await grabWorker(page);
  await mockClock(page, 6); // Afterlithe: summer
  const tiles = trackTiles(page);
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-tileset', 'default');
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  // The default set: only pixmaps/.
  expect(tiles.every((p) => p.startsWith('pixmaps/'))).toBe(true);
  const before = await settled(page);
  if (SHOT_DIR) await page.locator('.wc-pane-map canvas').screenshot({ path: `${SHOT_DIR}/tileset-default-${info.project.name}.png` });

  // Options → Mapper → Tileset: Desert (← once, wrapping).
  const frame = await openOptionsMapper(page);
  await expect(frame.locator('.wc-mrow[data-key="tileset"] .wc-label')).toHaveText('Tileset: Default (MMapper)');
  await expect(frame.locator('.wc-mapper-credit')).toHaveText("MMapper's default tiles");
  // ← from Default wraps to the last choices: Gray's Map, Gefe & Rik (ADR 0088), then Desert.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await expect(frame.locator('.wc-mrow[data-key="tileset"] .wc-label')).toHaveText("Tileset: Gray's Map");
  await page.keyboard.press('ArrowLeft');
  await expect(frame.locator('.wc-mrow[data-key="tileset"] .wc-label')).toHaveText('Tileset: Gefe & Rik');
  await page.keyboard.press('ArrowLeft');
  await expect(frame.locator('.wc-mrow[data-key="tileset"] .wc-label')).toHaveText('Tileset: Desert');
  await expect(frame.locator('.wc-mapper-credit')).toHaveText("By Khazdul, from Shimrod's tiles");
  await expect(content).toHaveAttribute('data-map-tileset', 'desert');
  // Exactly the renderer's files: Desert's own, the default pixmaps for what it lacks
  // (chosen afresh, so the sets passed on the way are not counted).
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'default' } }));
  await expect(content).toHaveAttribute('data-map-tileset', 'default');
  await page.waitForTimeout(1500);
  tiles.length = 0;
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'desert' } }));
  await expect(content).toHaveAttribute('data-map-tileset', 'desert');
  await expect.poll(() => [...new Set(tiles)].sort(), { timeout: 20_000 }).toEqual(expectedPaths('desert'));
  expect(tiles.some((p) => p.startsWith('tilesets/') && !p.startsWith('tilesets/desert/'))).toBe(false);
  // Back to the cockpit (the pane draws only while shown).
  for (let i = 0; i < 6 && (await page.locator('.wc-frame:not([hidden])').count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  await expect(page.locator('.wc-frame:not([hidden])')).toHaveCount(0);
  // The same map and view, other tiles.
  await expect(content).toHaveAttribute('data-map-rooms', '30074');
  await scene(page, 2);
  await expect.poll(async () => diff(before, await settled(page)), { timeout: 30_000 }).toBeGreaterThan(0.2);
  const desert = await settled(page);
  if (SHOT_DIR) await page.locator('.wc-pane-map canvas').screenshot({ path: `${SHOT_DIR}/tileset-desert-${info.project.name}.png` });

  // Alternating: the mocked clock says summer.
  tiles.length = 0;
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'shimrod' } }));
  await expect(content).toHaveAttribute('data-map-tileset', 'shimrod-summer');
  await expect.poll(() => [...new Set(tiles)].sort(), { timeout: 20_000 }).toEqual(expectedPaths('shimrod-summer'));
  await scene(page, 2);
  // Desert is Shimrod's tiles reworked: indoors they are close, so a smaller change.
  await expect.poll(async () => diff(desert, await settled(page)), { timeout: 30_000 }).toBeGreaterThan(0.02);
  if (SHOT_DIR) await page.locator('.wc-pane-map canvas').screenshot({ path: `${SHOT_DIR}/tileset-shimrod-summer-${info.project.name}.png` });
  if (SHOT_DIR) {
    await settled(page, 5);
    await page.locator('.wc-pane-map canvas').screenshot({ path: `${SHOT_DIR}/tileset-shimrod-summer-zoom5-${info.project.name}.png` });
  }

  // Back to the default: the default pixmaps again.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'default' } }));
  await expect(content).toHaveAttribute('data-map-tileset', 'default');
  await scene(page, 2);
  await expect.poll(async () => diff(before, await settled(page)), { timeout: 30_000 }).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

test('alternating picks the season of the game clock at start, and an HTML replay embeds it', async ({ page }) => {
  test.setTimeout(90_000);
  await mockClock(page, 1); // Solmath: winter
  const tiles = trackTiles(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { tileset: 'shimrod' }, panes: { map: { on: true } } }));
  // Start afresh with the stored choice: nothing but the winter set is fetched.
  await expect(page.locator('.wc-app .wc-pane-map .wc-pane-content')).toHaveAttribute('data-map-tileset', 'shimrod-winter');
  await page.waitForTimeout(2000);
  tiles.length = 0;
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-tileset', 'shimrod-winter');
  await expect.poll(() => [...new Set(tiles)].sort(), { timeout: 20_000 }).toEqual(expectedPaths('shimrod-winter'));

  // The export embeds the winter tiles under their pixmaps/ names (the
  // default pixmaps for the files the set lacks).
  const arda = await readMm2(new Uint8Array(readFileSync(new URL('../../public/map/arda.mm2', import.meta.url))), inflate);
  const us0 = 1_790_000_000_000_000;
  let log = gmcpLine(us0, 'Char.Name', { name: 'Rasta', fullname: 'Rasta' });
  [RENT_ROOM, RENT_ROOM + 1, RENT_ROOM + 2].forEach((r, i) => {
    const room = arda.serverId[r] ? { id: arda.serverId[r], name: arda.names[r], desc: arda.descs[r] } : { name: arda.names[r], desc: arda.descs[r] };
    log += gmcpLine(us0 + (i + 1) * 500_000, 'Room.Info', room);
  });
  const html = await page.evaluate((t) => window.__wc!.replayHtml({ texts: [t], character: 'Rasta' }), log);
  const p = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(html)![1]!);
  const files = p.map!.files;
  const pix = Object.keys(files).filter((k) => k.startsWith('pixmaps/'));
  expect(pix.length).toBeGreaterThan(10);
  const winter = setOf('shimrod-winter');
  let fromSet = 0;
  for (const k of pix) {
    const f = k.slice('pixmaps/'.length);
    const src = winter.lacks.includes(f) ? k : `tilesets/${winter.dir}/${f}`;
    if (src !== k) fromSet++;
    expect(files[k], k).toBe(`data:image/png;base64,${readFileSync(new URL(`../../public/map/${src}`, import.meta.url)).toString('base64')}`);
  }
  expect(fromSet).toBeGreaterThan(5);
});

test('community tilesets: last in the list, a white background while chosen, restored after (ADR 0088)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tiles = trackTiles(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  // The user's own background: Navy.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } }, mapper: { background: '#101c3c' } }));
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-drawn-ms', /\d/, { timeout: 30_000 });
  await expect(content).toHaveAttribute('data-map-bg', '#101c3c');
  const mapper = () => page.evaluate(() => window.__wc!.settings.get().mapper);

  const frame = await openOptionsMapper(page);
  const tileRow = frame.locator('.wc-mrow[data-key="tileset"] .wc-label');
  const bgRow = frame.locator('.wc-mrow[data-key="background"] .wc-label');
  await expect(tileRow).toHaveText('Tileset: Default (MMapper)');
  await expect(bgRow).toHaveText('Background colour: Navy');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');

  // ← from Default: Gray's Map, the last row. Rapids come from its water file.
  tiles.length = 0;
  await page.keyboard.press('ArrowLeft');
  await expect(tileRow).toHaveText("Tileset: Gray's Map");
  await expect(frame.locator('.wc-mapper-credit')).toHaveText("Tiles by Sunnyl75, after Gray's Mapeditor");
  await expect(bgRow).toHaveText('Background colour: White');
  await expect(content).toHaveAttribute('data-map-tileset', 'grays-map');
  await expect(content).toHaveAttribute('data-map-bg', '#ffffff');
  await expect.poll(() => [...new Set(tiles)].sort(), { timeout: 20_000 }).toEqual(expectedPaths('grays-map'));
  expect(tiles).toContain('tilesets/grays-map/terrain-water.png');
  expect(tiles.some((p) => p.endsWith('terrain-rapids.png'))).toBe(false);
  await page.waitForTimeout(1000);

  // ← again: Gefe & Rik, before it; still white, the Navy remembered.
  tiles.length = 0;
  await page.keyboard.press('ArrowLeft');
  await expect(tileRow).toHaveText('Tileset: Gefe & Rik');
  await expect(frame.locator('.wc-mapper-credit')).toHaveText("Tiles by Octavia, after Gefe & Rik's maps");
  await expect(bgRow).toHaveText('Background colour: White');
  await expect(content).toHaveAttribute('data-map-tileset', 'gefe-rik');
  await expect.poll(() => [...new Set(tiles)].sort(), { timeout: 20_000 }).toEqual(expectedPaths('gefe-rik'));
  expect(tiles.some((p) => p.startsWith('tilesets/') && !p.startsWith('tilesets/gefe-rik/'))).toBe(false);
  expect(await mapper()).toMatchObject({ tileset: 'gefe-rik', background: '#ffffff', backgroundBefore: '#101c3c' });

  // An HTML replay embeds the set and draws its flow marks as is, too.
  const arda = await readMm2(new Uint8Array(readFileSync(new URL('../../public/map/arda.mm2', import.meta.url))), inflate);
  const us0 = 1_790_000_000_000_000;
  let log = gmcpLine(us0, 'Char.Name', { name: 'Rasta', fullname: 'Rasta' });
  const room = arda.serverId[RENT_ROOM] ? { id: arda.serverId[RENT_ROOM], name: arda.names[RENT_ROOM], desc: arda.descs[RENT_ROOM] } : { name: arda.names[RENT_ROOM], desc: arda.descs[RENT_ROOM] };
  log += gmcpLine(us0 + 500_000, 'Room.Info', room);
  const html = await page.evaluate((t) => window.__wc!.replayHtml({ texts: [t], character: 'Rasta' }), log);
  const p = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(html)![1]!);
  expect(p.map!.streamsAsIs).toBe(true);
  const gefe = setOf('gefe-rik');
  const own = Object.keys(p.map!.files).filter((k) => k.startsWith('pixmaps/') && !gefe.lacks.includes(k.slice('pixmaps/'.length)));
  expect(own.length).toBeGreaterThan(5);
  for (const k of own) {
    const src = `../../public/map/tilesets/gefe-rik/${k.slice('pixmaps/'.length)}`;
    expect(p.map!.files[k], k).toBe(`data:image/png;base64,${readFileSync(new URL(src, import.meta.url)).toString('base64')}`);
  }

  // → → back to Default: the Navy comes back.
  await page.keyboard.press('ArrowRight');
  await expect(tileRow).toHaveText("Tileset: Gray's Map");
  await page.keyboard.press('ArrowRight');
  await expect(tileRow).toHaveText('Tileset: Default (MMapper)');
  await expect(bgRow).toHaveText('Background colour: Navy');
  await expect(content).toHaveAttribute('data-map-tileset', 'default');
  await expect(content).toHaveAttribute('data-map-bg', '#101c3c');
  expect(await mapper()).toMatchObject({ tileset: 'default', background: '#101c3c', backgroundBefore: '' });
  expect(errors).toEqual([]);
});
