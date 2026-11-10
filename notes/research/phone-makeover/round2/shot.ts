import { chromium } from '/home/ole/proj/webcockpit/node_modules/@playwright/test/index.mjs';
import { devServer } from '/home/ole/proj/webcockpit/scripts/lib/dev-server.ts';
import { gameFeed, live, pinGameMoment, sleep } from '/home/ole/proj/webcockpit/scripts/lib/mume-feed.ts';

const OUT = '/tmp/claude-1000/-home-ole-proj-webcockpit/0bc684e4-2427-4b7a-a2de-5044d203b7ad/scratchpad/map/';
const PORT = 5199;
const STEPS = Number(process.env.STEPS ?? -2.834);
const server = await devServer(PORT);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 3, baseURL: `http://localhost:${PORT}` });
  await pinGameMoment(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('page error', e.message));
  await page.addInitScript(() => {
    const Base = window.Worker;
    const list: Worker[] = [];
    (window as any).__mapWorkers = list;
    window.Worker = class extends Base {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        if (opts?.name === 'map') list.push(this);
      }
    };
  });
  await live(page, gameFeed('none'), (p) =>
    p.evaluate(() => {
      const s = (window as any).__wc.settings;
      const layout = structuredClone(s.get().layout);
      for (const lane of layout.docks.right.lanes) lane.size = 60;
      for (const q of layout.docks.right.head) if (q.id === 'map') q.desired = 560;
      s.update({ layout, mapper: { tileset: 'shimrod-summer', background: '#000000', hover: 'off' }, panes: { map: { on: true, border: false } } });
    }),
  );
  const content = page.locator('.wc-app .wc-pane-map .wc-pane-content');
  await content.and(page.locator('[data-map-drawn-ms]')).waitFor({ timeout: 60000 });
  await sleep(2000);
  const info = await content.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  console.log(JSON.stringify(info));
  const box = (await page.locator('.wc-pane-map canvas').boundingBox())!;
  console.log('canvas', box);
  await page.evaluate(([st, w, h]) => (window as any).__mapWorkers[0].postMessage({ t: 'zoom', steps: st, x: w / 2, y: h / 2 }), [STEPS, box.width, box.height]);
  await page.mouse.move(5, 5);
  await sleep(2500);
  const S = 390;
  const clip = { x: Math.round(box.x + box.width / 2 - S / 2), y: Math.round(box.y + box.height / 2 - S / 2), width: S, height: S };
  console.log('clip', clip, 'centre', box.x + box.width / 2, box.y + box.height / 2);
  await page.screenshot({ path: `${OUT}bree.png`, clip });
  await page.screenshot({ path: `${OUT}full.png`, scale: 'css' });
} finally {
  await browser.close();
  server?.kill();
}
