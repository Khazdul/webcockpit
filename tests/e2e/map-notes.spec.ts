// Stage 21 A (ADR 0077): with the Map pane on, the map file's room notes
// follow the located room's exits line in the game window (bold "Note:",
// italic text; not on the bus), Options → Mapper turns them off, and the
// mouse resting 3 s on a room shows the hover box (Minimal, then Full).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { formatGmcpRecord, formatInbound } from '../../src/capture/format';
import { readMm2 } from '../../src/map/mm2';

const ARDA = new URL('../../public/map/arda.mm2', import.meta.url);

async function rooms() {
  const map = await readMm2(new Uint8Array(readFileSync(ARDA)), async (z) => new Uint8Array(inflateSync(z)));
  const lines = (r: number) => map.notes[r]!.split('\n').filter((l) => l !== '').length;
  const pick = (n: (k: number) => boolean) => {
    for (let r = 0; r < map.roomCount; r++) if (map.serverId[r] !== 0 && map.notes[r] !== '' && n(lines(r))) return r;
    throw new Error('no room');
  };
  const one = pick((k) => k === 1);
  const multi = pick((k) => k > 1);
  const info = (r: number) => ({ id: map.serverId[r], name: map.names[r], desc: map.descs[r], exits: {} });
  return { map, one, multi, info };
}

test('room notes after the exits line, and the hover box', async ({ page }) => {
  const { map, one, multi, info } = await rooms();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { on: true } } }));
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });

  const T0 = 1790535600000000;
  const log = (room: number, t: number, exits: string) =>
    [
      formatGmcpRecord(T0 + t, 'Room.Info', JSON.stringify(info(room))),
      formatInbound(T0 + t, map.names[room]!),
      formatInbound(T0 + t, exits),
      formatInbound(T0 + t, 'A small dog is here.'),
      formatInbound(T0 + t, ''),
      formatInbound(T0 + t, '*=>'),
    ].join('\n');
  const text = [log(one, 0, 'Exits: north, south.'), log(multi, 500_000, 'Exits: east.')].join('\n') + '\n';
  await page.evaluate((t) => window.__wc!.app.startReplay(t, 'notes.log', 0), text);
  await expect(content).toHaveAttribute('data-map-room', String(multi), { timeout: 15_000 });

  const rows = page.locator('.wc-game .wc-rows .wc-row');
  const oneNote = map.notes[one]!.trim();
  const multiLines = map.notes[multi]!.split('\n').filter((l) => l !== '');
  await expect(page.locator('.wc-game')).toContainText(`Note: ${oneNote}`);
  const all = await rows.allTextContents();
  const at = all.indexOf('Exits: north, south.');
  expect(all.slice(at, at + 3)).toEqual(['Exits: north, south.', `Note: ${oneNote}`, 'A small dog is here.']);
  const at2 = all.indexOf('Exits: east.');
  expect(all.slice(at2, at2 + 3 + multiLines.length)).toEqual([
    'Exits: east.',
    'Note:',
    ...multiLines.map((l) => `  ${l}`),
    'A small dog is here.',
  ]);
  const note = page.locator('.wc-game .wc-note').first();
  await expect(note.locator('.wc-note-label')).toHaveCSS('font-weight', '700');
  await expect(note.locator('.wc-note-text')).toHaveCSS('font-style', 'italic');

  // Hover: the view is centred on the player's room; rest 3 s on the canvas centre.
  const canvas = page.locator('.wc-pane-map .wc-map-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + 1, cy + 1);
  await page.mouse.move(cx, cy);
  const hover = page.locator('.wc-pane-map .wc-map-hover');
  await page.waitForTimeout(1500);
  await expect(hover).toHaveCount(0); // not before 3 s
  await expect(hover).toBeVisible({ timeout: 4000 });
  await expect(hover.locator('.wc-map-hover-name')).toHaveText(map.names[multi]!);
  await expect(hover.locator('.wc-map-hover-note')).toHaveText(multiLines);
  await expect(hover.locator('.wc-map-hover-desc')).toHaveCount(0);
  const hb = (await hover.boundingBox())!;
  expect(hb.x).toBeGreaterThanOrEqual(box.x);
  expect(hb.x + hb.width).toBeLessThanOrEqual(box.x + box.width + 1);
  // Leaving the room hides it.
  await page.mouse.move(cx + 200, cy + 150);
  await expect(hover).toBeHidden();

  // Full: description and exits too; never the area.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { hover: 'full' } }));
  await page.mouse.move(cx, cy);
  await expect(hover).toBeVisible({ timeout: 5000 });
  await expect(hover).toHaveClass(/is-full/);
  await expect(hover.locator('.wc-map-hover-desc').first()).toBeVisible();
  await expect(hover.locator('.wc-map-hover-exits')).toHaveText(/^Exits: /);
  if (map.areas[multi]) await expect(hover).not.toContainText(map.areas[multi]!);
  await page.mouse.wheel(0, 100);
  await expect(hover).toBeHidden();

  // Off: no box at all.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { hover: 'off' } }));
  await page.mouse.move(cx + 40, cy + 40);
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(3600);
  await expect(hover).toBeHidden();

  // Off: no new notes.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { notes: false } }));
  const before = await page.locator('.wc-game .wc-note').count();
  await page.evaluate((t) => window.__wc!.app.startReplay(t, 'notes2.log', 0), log(one, 0, 'Exits: up.') + '\n');
  await expect(page.locator('.wc-game')).toContainText('Exits: up.');
  await page.waitForTimeout(300);
  expect(await page.locator('.wc-game .wc-note').count()).toBe(before);
  expect(errors).toEqual([]);
});
