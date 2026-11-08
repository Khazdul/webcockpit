// "An evening in Bree" (the test scene, ADR 0133): Rasta walks ten rooms
// through Bree at a pace a viewer can follow, typing each command, the map
// following him; Gibur's tell arrives in the Comm pane; the sun goes down
// over the walk (a whole sunset, the weather's slow paces 5× faster).
//
// Markers: `start`, `map` and `comm` (the panes' boxes), `sunset` (the turn
// starts), `walk` (the first move), `cmd` (each command as it is typed),
// `tell` (the Comm pane's box), `walk-end`, `pointer` (the pointer has
// glided to the tell), `night` (the turn's second), `active` and
// `active-end` (the stretch the capture stats are judged on), `end`.
import type { WebSocketRoute } from '@playwright/test';
import { DAY, type DevWindow, SCENE, connect, jump, play, sleep, weather } from '../../../scripts/lib/mume-feed.ts';
import { breeFeed } from '../../feeds/bree.ts';
import { glide, place } from '../lib/mouse.ts';
import type { Scene } from '../lib/scene.ts';

/** The weather's slow paces this many times faster: the 60 s sunset runs in 12 s. */
const SPEED = 5;

export const bree: Scene = {
  // The test scene zooms into the map pane: DPR 2.
  mode: 'intel-2',

  async setup(page) {
    const { before, look, walk } = breeFeed();
    const server = await connect(page);
    // The client's own startup lines ([SYSTEM] …) first, so the feed scrolls them out of view.
    await page
      .locator('.wc-output', { hasText: 'Offline replay mode.' })
      .first()
      .waitFor({ timeout: 4000 })
      .catch(() => {});
    await sleep(300);
    await play(page, server, before);
    await weather(page);
    // A clear late afternoon, the sun low in the west.
    await jump(page, { ...SCENE, ...DAY, weather: ' ', sunU: 0.88 });
    // The map's data has loaded by now: a look centres it on Rasta.
    await sleep(2000);
    await play(page, server, look);
    await page.locator('.wc-input-field').fill('');
    // Let the panes, the map and the sky settle.
    await sleep(2000);
    await place(page, 700, 880);
    return { server, walk };
  },

  async run({ page, marks }, state) {
    const server = state.server as WebSocketRoute;
    const walk = state.walk as Parameters<typeof play>[2];
    marks.mark('start', 'An evening in Bree');
    await marks.markBox('map', 'map pane', page.locator('.wc-pane[data-pane="map"]'));
    await marks.markBox('comm', 'Comm pane', page.locator('.wc-pane[data-pane="comm"]'));
    await sleep(800);
    // The sunset from its first second, fast: 60 s / SPEED to the night's second.
    await page.evaluate((k) => {
      const w = (window as unknown as DevWindow).__weather!;
      w.setSpeed(k);
      w.emit('sun.set', { from: -60 });
    }, SPEED);
    marks.mark('sunset', 'the sun goes down');
    await sleep(300);
    marks.mark('active', 'capture stats from here (the sky moves)');
    const nightAt = Date.now() + 60_000 / SPEED;
    marks.markAt(nightAt, 'night', 'the night begins');
    await sleep(900);
    marks.mark('walk', 'Rasta walks');
    await play(page, server, walk, {
      typeDelay: 110,
      afterCmd: 160,
      afterOut: 120,
      beforeCmd: 620,
      onStep: async (s) => {
        if ('cmd' in s) marks.mark('cmd', s.cmd);
        else if (s.mark === 'tell') {
          await marks.markBox('tell', "Gibur tells you 'meet me at the Pony, bring the merc'", page.locator('.wc-pane[data-pane="comm"]'));
        }
      },
    });
    await page.locator('.wc-input-field').fill('');
    marks.mark('walk-end', 'the walk ends');
    // The pointer drifts over to the tell in the Comm pane.
    const comm = (await page.locator('.wc-pane[data-pane="comm"]').boundingBox())!;
    await glide(page, comm.x + comm.width * 0.45, comm.y + comm.height * 0.78, { ms: 1100 });
    marks.mark('pointer', 'the pointer rests on the tell');
    await sleep(Math.max(0, nightAt - Date.now()));
    marks.mark('active-end', 'capture stats to here');
    // The turn's sky completes 10 s / SPEED after its second; then the clock says night.
    await sleep(2200);
    await page.evaluate(() => {
      const w = (window as unknown as DevWindow).__weather!;
      w.jump({ clock: 'night', light: ')', sunU: -1 });
      w.setSpeed(1);
    });
    await sleep(1500);
    marks.mark('end', 'the end');
  },
};
