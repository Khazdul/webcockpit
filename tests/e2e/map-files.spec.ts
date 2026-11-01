// Stage 9 P3 (ADR 0020 "Map files and storage", "Replays"): Settings →
// Mapper (in play, ADR 0107) imports a .mm2 and the running Map pane
// reloads it, and later goes back to the bundled map; the
// log player uses the same map; an HTML replay embeds the map subset
// around the rooms its chain visited and loads it from file://.
import { NO_STATE } from './legacy-state';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { DIR_COUNT, type MapData } from '../../src/map/model';
import { readMm2 } from '../../src/map/mm2';
import { writeMm2 } from '../../src/map/mm2-write';
import { extractVisits, replaySubset } from '../../src/map/tools';
import { gmcpLine, gridMap } from '../unit/map-grid';

const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));
const deflate = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateSync(b));

type ReplayWindow = { __wcReplay?: { host: { store: { update(p: object): void } } } };

test('Settings → Mapper imports a map; the pane and the log player load it; Use bundled map goes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-rooms', '30074', { timeout: 20_000 });

  // The Settings popup's Mapper tab.
  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="mapper"]').click();
  const pop = page.locator('.wc-sp-settings');
  await expect(pop.locator('.wc-sp-mapfile')).toHaveText('arda.mm2 (bundled)');
  await expect(pop.locator('.wc-ck-tg[aria-label="Show map pane"]')).toHaveAttribute('aria-checked', 'true');

  // A bad file keeps the map.
  const input = pop.locator('.wc-sp-mapfile-input');
  await input.setInputFiles({ name: 'junk.mm2', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) });
  await expect(pop.locator('.wc-sp-mapnote')).toHaveText(/^Import failed: Not an MMapper map/);

  // A small synthetic map: stored, and the running pane reloads it.
  const small = await writeMm2(gridMap(7, 3), deflate);
  await input.setInputFiles({ name: 'small.mm2', mimeType: 'application/octet-stream', buffer: Buffer.from(small) });
  await expect(pop.locator('.wc-sp-mapnote')).toHaveText('Imported small.mm2 (21 rooms).', { timeout: 15_000 });
  await expect(pop.locator('.wc-sp-mapfile')).toContainText('small.mm2 · 21 rooms');
  await expect(content).toHaveAttribute('data-map-rooms', '21', { timeout: 15_000 });

  // Kept across a reload.
  await page.reload();
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await expect(content).toHaveAttribute('data-map-rooms', '21', { timeout: 20_000 });

  // The log player's App uses the same map (from the start page).
  await page.goto('/');
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(async () => {
    const us = 1_790_000_000_000_000;
    const text = `${us} Hello.\n${us + 1_000_000} World.\n`;
    const meta = { runId: 'P/0', character: 'P', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 2 };
    await window.__wc!.shell.openPlayerChain([{ meta, text }], [], { character: 'P' });
  });
  const playerMap = page.locator('.wc-player .wc-pane-map .wc-pane-content');
  await expect(playerMap).toHaveAttribute('data-map-rooms', '21', { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-player')).toHaveCount(0);

  // Use bundled map (back in play: the start page has no Options since
  // stage 32; the TUI Mapper page, the phone's, is in tests/unit/chrome-mapper).
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="mapper"]').click();
  await expect(pop.locator('.wc-sp-mapfile')).toContainText('small.mm2 · 21 rooms');
  await pop.locator('.wc-sp-bundled').click();
  await expect(pop.locator('.wc-sp-mapnote')).toHaveText('Using the bundled map.');
  await expect(pop.locator('.wc-sp-mapfile')).toHaveText('arda.mm2 (bundled)');
  await expect(content).toHaveAttribute('data-map-rooms', '30074', { timeout: 20_000 });
  expect(await page.evaluate(async () => (await window.__wc!.shell.maps.current()).kind)).toBe('bundled');
  expect(errors).toEqual([]);
});

/** A trip of `n` rooms: the shortest path from the first room with a server id to a room that far away. */
function trip(map: MapData, n: number): number[] {
  const start = map.serverId.findIndex((s) => s !== 0);
  const parent = new Map<number, number>([[start, -1]]);
  let frontier = [start];
  let last = start;
  for (let d = 1; d < n && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const r of frontier) {
      for (let k = map.outStart[r * DIR_COUNT]!; k < map.outStart[r * DIR_COUNT + 6]!; k++) {
        const t = map.outTo[k]!;
        if (!parent.has(t)) {
          parent.set(t, r);
          next.push(t);
        }
      }
    }
    if (next.length > 0) last = next[0]!;
    frontier = next;
  }
  const path: number[] = [];
  for (let r = last; r >= 0; r = parent.get(r)!) path.unshift(r);
  return path;
}

test('an HTML replay embeds the map subset and loads it from file://', async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  // A chain through real arda.mm2 rooms: Room.Info by id where the room has one, else by name + description.
  const arda = await readMm2(new Uint8Array(readFileSync(new URL('../../public/map/arda.mm2', import.meta.url))), inflate);
  const path = trip(arda, 30);
  expect(path.length).toBe(30);
  const us0 = 1_790_000_000_000_000;
  let log = gmcpLine(us0, 'Char.Name', { name: 'Rasta', fullname: 'Rasta' });
  path.forEach((r, i) => {
    const us = us0 + (i + 1) * 500_000;
    const room = arda.serverId[r] ? { id: arda.serverId[r], name: arda.names[r], desc: arda.descs[r] } : { name: arda.names[r], desc: arda.descs[r] };
    log += gmcpLine(us, 'Room.Info', room);
    log += `${us + 1000} ${arda.names[r]}\n`;
  });
  const expected = replaySubset(arda, extractVisits([log]))!;
  expect(expected.visited).toBeGreaterThanOrEqual(path.length - 2);

  await page.goto('/');
  await page.waitForFunction(() => window.__wc !== undefined);
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const noRooms = log.split('\n').filter((l) => !l.includes('GMCP Room.Info')).join('\n');
  const [html, plain] = await page.evaluate(
    async ([t, p]) => [await window.__wc!.replayHtml({ texts: [t!], character: 'Rasta' }), await window.__wc!.replayHtml({ texts: [p!], character: 'Rasta' })],
    [log, noRooms],
  );
  console.log(
    `HTML replay: ${html.length} bytes with the map (${expected.map.roomCount} rooms, ${expected.visited} visited), ` +
      `${plain.length} without; delta ${html.length - plain.length} bytes`,
  );
  const file = info.outputPath('replay-map.html');
  writeFileSync(file, html);

  const context = await browser.newContext({ viewport: { width: 1400, height: 820 }, offline: true, storageState: NO_STATE });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  const p = await context.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`file://${file}`);
  await p.waitForFunction(() => (window as unknown as ReplayWindow).__wcReplay != null);
  const content = p.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  await expect(content).toHaveAttribute('data-map-rooms', String(expected.map.roomCount));
  expect(errors).toEqual([]);
  await context.close();
});
