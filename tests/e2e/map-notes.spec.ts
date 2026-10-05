// Stage 21 A (ADR 0077): with the Map pane on, the map file's room notes
// follow the located room's exits line in the game window (bold "Note:",
// italic text; not on the bus), Options → Mapper turns them off, and the
// mouse resting 3 s on a room shows the hover box (Minimal, then Full).
// Round 1: Full is MMapper's room preview, the box sits outside the pane,
// the text size is a setting, a click then a still pointer shows it, and
// the top row of a borderless map (under the title grip) hovers too.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { formatGmcpRecord, formatInbound } from '../../src/capture/format';
import { exitsText } from '../../src/map/hover';
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
  // A room with a one-line note, contents and a description (MMapper's preview).
  let rich = -1;
  for (let r = 0; r < map.roomCount && rich < 0; r++) {
    if (map.serverId[r] !== 0 && lines(r) === 1 && map.contents[r] !== '' && map.descs[r] !== '' && map.areas[r] !== '') rich = r;
  }
  const info = (r: number) => ({ id: map.serverId[r], name: map.names[r], desc: map.descs[r], exits: {} });
  return { map, one, multi, info, rich };
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
  const hover = page.locator('.wc-map-hover');
  await page.waitForTimeout(1500);
  await expect(hover).toHaveCount(0); // not before 3 s
  await expect(hover).toBeVisible({ timeout: 4000 });
  await expect(hover.locator('.wc-map-hover-name')).toHaveText(map.names[multi]!);
  await expect(hover.locator('.wc-map-hover-note')).toHaveText(multiLines);
  await expect(hover.locator('.wc-map-hover-desc')).toHaveCount(0);
  // Outside the map pane (round 1): the default float has more room on its left.
  const pb = (await page.locator('.wc-pane-map').boundingBox())!;
  const hb = (await hover.boundingBox())!;
  expect(hb.x + hb.width).toBeLessThanOrEqual(pb.x + 1);
  expect(hb.x).toBeGreaterThanOrEqual(0);
  await expect(hover).toHaveAttribute('data-where', 'left');
  // Leaving the room hides it.
  await page.mouse.move(cx + 200, cy + 150);
  await expect(hover).toBeHidden();

  // Full: description and exits too; never the area.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { hover: 'full' } }));
  await page.mouse.move(cx, cy);
  await expect(hover).toBeVisible({ timeout: 5000 });
  await expect(hover).toHaveClass(/is-full/);
  await expect(hover.locator('.wc-map-hover-desc').first()).toBeVisible();
  await expect(hover.locator('.wc-map-hover-exits')).toHaveText(exitsText(map, multi));
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

test('hover round 1: Full as MMapper preview outside the pane, text size, click then still, top row of a borderless map', async ({ page }) => {
  const { map, rich, info } = await rooms();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-cockpit')).toBeVisible();
  await page.evaluate(() =>
    window.__wc!.settings.update({ panes: { map: { on: true } }, mapper: { hover: 'full', hoverSize: 'medium' } }),
  );
  const content = page.locator('.wc-pane-map .wc-pane-content');
  await expect(content).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  const T0 = 1790535600000000;
  const text =
    [
      formatGmcpRecord(T0, 'Room.Info', JSON.stringify(info(rich))),
      formatInbound(T0, map.names[rich]!),
      formatInbound(T0, 'Exits: north.'),
      formatInbound(T0, '*=>'),
    ].join('\n') + '\n';
  await page.evaluate((t) => window.__wc!.app.startReplay(t, 'rich.log', 0), text);
  await expect(content).toHaveAttribute('data-map-room', String(rich), { timeout: 15_000 });

  const canvas = page.locator('.wc-pane-map .wc-map-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hover = page.locator('.wc-map-hover');

  // Full: MMapper's room preview. Name (green), description, contents
  // (italic), the exits line, the note; never area, terrain or flag words.
  await page.mouse.move(cx + 1, cy + 1);
  await page.mouse.move(cx, cy);
  await expect(hover).toBeVisible({ timeout: 5000 });
  const lines = (t: string) => t.split('\n').filter((l) => l.trim() !== '');
  await expect(hover.locator('.wc-map-hover-name')).toHaveText(map.names[rich]!);
  await expect(hover.locator('.wc-map-hover-desc')).toHaveText(lines(map.descs[rich]!).map((l) => l.trim()).join(' '));
  await expect(hover.locator('.wc-map-hover-contents')).toHaveText(lines(map.contents[rich]!));
  await expect(hover.locator('.wc-map-hover-contents').first()).toHaveCSS('font-style', 'italic');
  await expect(hover.locator('.wc-map-hover-exits')).toHaveText(exitsText(map, rich));
  await expect(hover.locator('.wc-map-hover-exits')).toHaveText(/^Exits: .*\.$/);
  await expect(hover.locator('.wc-map-hover-note')).toHaveText(`Note: ${map.notes[rich]!.trim()}`);
  await expect(hover).not.toContainText(map.areas[rich]!);
  await expect(hover).not.toContainText('emulated');
  await expect(hover).not.toContainText('###');
  const ok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-ok').trim());
  const green = await page.evaluate((c) => {
    const d = document.createElement('div');
    d.style.color = c;
    document.body.append(d);
    const v = getComputedStyle(d).color;
    d.remove();
    return v;
  }, ok);
  await expect(hover.locator('.wc-map-hover-name')).toHaveCSS('color', green);
  // Outside the pane, inside the viewport, at most about 56ch wide.
  const pb = (await page.locator('.wc-pane-map').boundingBox())!;
  let hb = (await hover.boundingBox())!;
  expect(hb.x + hb.width).toBeLessThanOrEqual(pb.x + 1);
  expect(hb.y).toBeGreaterThanOrEqual(0);
  expect(hb.y + hb.height).toBeLessThanOrEqual(820);
  const cellW = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell-w')));
  expect(hb.width).toBeLessThanOrEqual(57 * cellW + 2);
  const medium = parseFloat(await hover.evaluate((e) => getComputedStyle(e).fontSize));

  // Text size: Large is bigger, Small smaller.
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { hoverSize: 'large' } }));
  await page.mouse.move(cx + 60, cy + 40);
  await expect(hover).toBeHidden();
  await page.mouse.move(cx, cy);
  await expect(hover).toBeVisible({ timeout: 5000 });
  await expect(hover).toHaveAttribute('data-size', 'large');
  expect(parseFloat(await hover.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThan(medium);
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { hoverSize: 'small' } }));
  await page.mouse.move(cx + 60, cy + 40);
  await page.mouse.move(cx, cy);
  await expect(hover).toBeVisible({ timeout: 5000 });
  expect(parseFloat(await hover.evaluate((e) => getComputedStyle(e).fontSize))).toBeLessThan(medium);
  await page.evaluate(() => window.__wc!.settings.update({ mapper: { hoverSize: 'medium', hover: 'minimal' } }));

  // A click, then the pointer still: the box comes (the button hid it).
  await page.mouse.down();
  await expect(hover).toBeHidden();
  await page.mouse.up();
  await expect(hover).toBeVisible({ timeout: 4500 });
  await expect(hover.locator('.wc-map-hover-name')).toHaveText(map.names[rich]!);

  // The top row of a borderless map lies under the title grip: it hovers too.
  await page.evaluate(() => window.__wc!.settings.update({ panes: { map: { border: false } } }));
  await page.mouse.move(cx + 60, cy + 40);
  await expect(hover).toBeHidden();
  const b2 = (await canvas.boundingBox())!;
  const x2 = b2.x + b2.width / 2;
  const y2 = b2.y + b2.height / 2;
  const top = b2.y + 6;
  const grip = await page.evaluate(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement).className, [x2, top]);
  expect(grip).toContain('wc-pane-grip');
  // Drag the player's room up to the top row (the canvas is grabbed below the grip).
  await page.mouse.move(x2, y2);
  await page.mouse.down();
  await page.mouse.move(x2, top, { steps: 6 });
  await page.mouse.up();
  await page.mouse.move(x2 + 80, y2);
  await expect(hover).toBeHidden();
  await page.mouse.move(x2 + 1, top + 1);
  await page.mouse.move(x2, top);
  await expect(hover).toBeVisible({ timeout: 5000 });
  await expect(hover.locator('.wc-map-hover-name')).toHaveText(map.names[rich]!);
  // Leaving the pane hides it.
  await page.mouse.move(20, 400);
  await expect(hover).toBeHidden();
  expect(errors).toEqual([]);
});
