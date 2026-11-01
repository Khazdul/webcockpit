// Phone screenshot tour. Run: node tour.ts [section...]
import { chromium, phoneCtx, live, startPage, sleep, OUT } from './lib.ts';
const only = process.argv.slice(2);
let n = Number(process.env.START ?? 1);
const log: string[] = [];
async function shot(page, slug: string) {
  const name = `${String(n++).padStart(2, '0')}-${slug}.png`;
  await page.screenshot({ path: OUT + name });
  log.push(name);
  console.log(name);
}
const SF = '.wc-start .wc-frame:not([hidden])';
const OF = '.wc-overlay .wc-frame:not([hidden])';
const title = (page, F) => page.locator(F).first().evaluate((el) => (el.getAttribute('data-frame') ?? '') + '|' + (el.querySelector('.wc-title-row')?.textContent ?? '') + '|' + (el.querySelector('.wc-stats') ? 'stats' : ''), null, { timeout: 1500 }).catch(() => '');
const popOpen = (page) => page.locator('.wc-pop').count();

/** Scrolls the biggest scrollable thing in `root` page by page, a shot each (up to `max`). */
async function scrollShots(page, root: string, slug: string, max = 3) {
  for (let i = 1; i <= max; i++) {
    const moved = await page.evaluate((sel) => {
      const roots = [...document.querySelectorAll(sel)];
      let best = null, bh = 0;
      for (const r of roots) for (const x of [r, ...r.querySelectorAll('*')]) {
        const cs = getComputedStyle(x);
        if (x.scrollHeight > x.clientHeight + 8 && /(auto|scroll)/.test(cs.overflowY) && x.clientHeight > 40 && x.scrollHeight - x.clientHeight > bh) { best = x; bh = x.scrollHeight - x.clientHeight; }
      }
      if (!best) return false;
      const before = best.scrollTop;
      best.scrollTop = before + best.clientHeight * 0.85;
      return best.scrollTop > before + 2;
    }, root);
    if (!moved) return;
    await sleep(300);
    await shot(page, `${slug}-scroll${i}`);
  }
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function back(page, F, want: string) {
  for (let i = 0; i < 3; i++) {
    if ((await popOpen(page)) === 0 && (await title(page, F)) === want) return;
    await page.keyboard.press('Escape');
    await sleep(350);
  }
}

/** Taps each row of the open overlay frame; shoots what opens; recurses `depth` more levels. */
async function walk(page, prefix: string, depth: number, skip = ['continue', 'reconnect', 'exit', 'back']) {
  const t0 = await title(page, OF);
  const keys: string[] = await page.locator(`${OF} .wc-mrow`).evaluateAll((els) => els.map((e) => e.getAttribute('data-key')));
  for (const k of keys) {
    if (!k || skip.includes(k)) continue;
    const row = page.locator(`${OF} .wc-mrow[data-key="${k}"] .wc-label`);
    if (!(await row.count())) continue;
    await row.first().tap({ timeout: 3000 }).catch(() => {});
    await sleep(600);
    const slug = `${prefix}-${slugify(k)}`;
    if (await popOpen(page)) {
      await shot(page, `${slug}-popup`);
      await scrollShots(page, '.wc-pop', `${slug}-popup`);
    } else if ((await title(page, OF)) !== t0) {
      await shot(page, slug);
      await scrollShots(page, OF, slug);
      if (depth > 0) await walk(page, slug, depth - 1, [...skip]);
    } else {
      console.log(`  (row ${k} in ${t0} changed nothing visible / toggled in place)`);
      continue;
    }
    await back(page, OF, t0);
  }
}

const b = await chromium.launch();
const run = async (name: string, f: () => Promise<void>) => {
  if (only.length && !only.includes(name)) return;
  try { await f(); } catch (e) { console.log(`SECTION ${name} FAILED: ${(e as Error).message.split('\n')[0]}`); }
};

// 1. start page, dark and paper
await run('start', async () => {
  const { ctx, page } = await phoneCtx(b);
  await startPage(page); await sleep(800);
  await shot(page, 'start-dark');
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await sleep(600);
  await shot(page, 'start-paper');
  await ctx.close();
});

// 2. start-menu entries, with the demo runs restored
await run('startmenu', async () => {
  const { ctx, page } = await phoneCtx(b);
  await page.clock.setSystemTime(new Date(2026, 8, 28, 12, 0, 0).getTime());
  await startPage(page);
  await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
  const T0 = await title(page, SF);
  const open = async (k: string) => { await page.locator(`${SF} .wc-mrow[data-key="${k}"] .wc-label`).tap(); await sleep(700); };
  const btn = async (b: string) => { await page.locator(`${SF} [data-btn="${b}"]`).first().tap(); await sleep(800); };
  const home = async () => { for (let i = 0; i < 4 && (await page.locator(`${SF} .wc-mrow[data-key="enter"]`).count()) === 0; i++) { await page.keyboard.press('Escape'); await sleep(350); } };

  await open('profile'); await shot(page, 'start-profile'); await scrollShots(page, SF, 'start-profile');
  await btn('EDIT'); await shot(page, 'start-profile-edit'); await scrollShots(page, 'body', 'start-profile-edit');
  await home();
  await open('profile'); await btn('NEW'); await shot(page, 'start-profile-new'); await home();

  await open('scripts'); await shot(page, 'start-scripts'); await scrollShots(page, SF, 'start-scripts');
  await btn('EDIT'); await shot(page, 'start-scripts-edit'); await scrollShots(page, 'body', 'start-scripts-edit', 2);
  await home();
  await open('scripts'); await btn('MANUAL'); await shot(page, 'start-scripts-manual'); await scrollShots(page, 'body', 'start-scripts-manual', 2); await home();

  await open('history'); await sleep(500); await shot(page, 'start-history'); await scrollShots(page, SF, 'start-history');
  await btn('RUN LOG'); await shot(page, 'start-history-runlog'); await home();
  await open('history'); await btn('STATS'); await shot(page, 'start-history-stats'); await scrollShots(page, 'body', 'start-history-stats', 2); await home();
  await open('history'); await btn('RATE'); await shot(page, 'start-history-rate'); await home();

  await open('spotlights'); await sleep(2500); await shot(page, 'start-spotlights');
  await page.locator('.wc-player-stage').tap({ position: { x: 40, y: 500 } }).catch(() => {}); await sleep(700);
  await shot(page, 'start-spotlights-controls');
  await startPage(page, '?phone=1');
  await open('credits'); await sleep(3000); await shot(page, 'start-credits');
  await startPage(page, '?phone=1');
  await open('about'); await shot(page, 'start-about'); await scrollShots(page, SF, 'start-about', 4); await home();
  void T0;
  await ctx.close();
});

// 3–6. game
await run('game', async () => {
  const { ctx, page } = await phoneCtx(b);
  const server = await live(page);
  await sleep(1000);
  await shot(page, 'game-tab');
  const tabs: string[] = await page.locator('.wc-phone-tab').evaluateAll((els) => els.map((e) => e.getAttribute('data-tab')));
  for (const t of tabs) {
    if (t === 'game') continue;
    await page.locator(`.wc-phone-tab[data-tab="${t}"]`).tap();
    await sleep(t === 'map' ? 2500 : 700);
    await shot(page, `tab-${t}`);
  }
  await page.locator('.wc-phone-tab[data-tab="game"]').tap(); await sleep(400);
  // keyboard up
  await page.locator('.wc-input-field').tap(); await page.keyboard.insertText('look at the ');
  await page.setViewportSize({ width: 390, height: 480 }); await sleep(800);
  await shot(page, 'game-keyboard-up');
  await page.locator('.wc-phone-tab[data-tab="comm"]').tap().catch(() => {}); await sleep(500);
  await shot(page, 'comm-keyboard-up');
  await page.locator('.wc-phone-tab[data-tab="game"]').tap().catch(() => {});
  await page.locator('.wc-input-field').fill(''); await page.locator('.wc-input-field').blur();
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(800);
  // ESC menu
  await page.locator('.wc-menu-btn').tap(); await sleep(600);
  await shot(page, 'esc-menu');
  await walk(page, 'esc', 1);
  // Exit session confirm
  await page.locator(`${OF} .wc-mrow[data-key="exit"] .wc-label`).tap(); await sleep(600);
  await shot(page, 'esc-exit-confirm');
  await back(page, OF, await title(page, OF)); await page.keyboard.press('Escape'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(400);
  // paper in game
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } })); await sleep(700);
  await shot(page, 'game-paper');
  await page.locator('.wc-phone-tab[data-tab="character"]').tap(); await sleep(500);
  await shot(page, 'tab-character-paper');
  await page.locator('.wc-menu-btn').tap(); await sleep(600);
  await shot(page, 'esc-menu-paper');
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#000000', fg: '#c0c0c0' } })); await sleep(500);
  await page.locator('.wc-phone-tab[data-tab="game"]').tap(); await sleep(400);
  // disconnect
  await server.close(); await sleep(1200);
  await shot(page, 'disconnected-menu');
  await page.keyboard.press('Escape'); await sleep(500);
  await shot(page, 'disconnected-game');
  await ctx.close();
});

// 7. landscape
await run('landscape', async () => {
  const { ctx, page } = await phoneCtx(b, { w: 844, h: 390 });
  await live(page); await sleep(1000);
  await shot(page, 'landscape-game');
  await page.locator('.wc-phone-tab[data-tab="map"]').tap().catch(() => {}); await sleep(2000);
  await shot(page, 'landscape-map');
  await page.locator('.wc-phone-tab[data-tab="game"]').tap().catch(() => {}); await sleep(300);
  await page.locator('.wc-menu-btn').tap(); await sleep(600);
  await shot(page, 'landscape-esc-menu');
  await page.locator(`${OF} .wc-mrow[data-key="options"] .wc-label`).tap(); await sleep(500);
  await shot(page, 'landscape-esc-options');
  await page.locator(`${OF} .wc-mrow[data-key="appearance"] .wc-label`).tap(); await sleep(500);
  if (await popOpen(page)) await shot(page, 'landscape-esc-appearance'); else await shot(page, 'landscape-esc-appearance');
  await ctx.close();
  const p2 = await phoneCtx(b, { w: 844, h: 390 });
  await startPage(p2.page); await sleep(600);
  await shot(p2.page, 'landscape-start');
  await p2.ctx.close();
});

await b.close();
console.log(`${log.length} shots`);
