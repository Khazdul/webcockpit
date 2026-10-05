// Script panes in runs (stage 11 P1, ADR 0053): a run recorded on the
// live mock while a user script shows a pane plays back in the log player
// and in the exported HTML replay with the pane as the player saw it,
// without Lua: the content is there, the link's tooltip shows, a click
// does nothing.
import { NO_STATE } from './legacy-state';
import { writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const ID = 'rec/main';

const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

const SCRIPT = `-- @name rec
-- @api 1
local p = createPane{id = "main", title = "Rec Pane", dock = "float", rows = 4, cols = 24}
p:setLine(1, "<yellow>[order]<reset> other")
p:setLink(1, 1, 7, function() send("order merc") end, "Order the merc")
p:gauge(2, {value = 30, max = 60, label = "half"})
p:setLine(3, "before")
tempAlias("^pu$", function() p:setLine(3, "updated") end)
`;

async function putScript(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise((r) => {
            const q = indexedDB.open('webcockpit');
            q.onsuccess = () => {
              const ok = q.result.objectStoreNames.contains('scripts');
              q.result.close();
              r(ok);
            };
            q.onerror = () => r(false);
          }),
      ),
    )
    .toBe(true);
  await page.evaluate(
    (source) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('webcockpit');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('scripts', 'readwrite');
          tx.objectStore('scripts').put({ id: 'rec-1', name: 'rec', source, enabled: true, created: 1, updated: 1 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    SCRIPT,
  );
}

const pane = (page: Page) => page.locator(`.wc-player .wc-pane[data-pane="${ID}"]`);
const prows = (page: Page) => pane(page).locator('.wc-pane-content .wc-prow');

/** Hovers the link (row 1, cells 1–7) and checks the tooltip; a click changes nothing. */
async function checkInertLink(page: Page): Promise<void> {
  const cell = await page.evaluate(() => {
    const el = document.querySelector('.wc-player') ?? document.documentElement;
    const s = getComputedStyle(el);
    return { w: parseFloat(s.getPropertyValue('--cell-w')), h: parseFloat(s.getPropertyValue('--cell-h')) };
  });
  const content = (await pane(page).locator('.wc-pane-content').boundingBox())!;
  const at = { x: content.x + 2.5 * cell.w, y: content.y + 0.5 * cell.h };
  await page.mouse.move(at.x, at.y);
  const tip = page.locator('.wc-player .wc-spane-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/Order the merc/);
  await expect(pane(page).locator('.wc-pane-content')).not.toHaveCSS('cursor', 'pointer');
  const before = await prows(page).allTextContents();
  await page.mouse.click(at.x, at.y);
  await expect(prows(page)).toHaveText(before);
  await page.mouse.move(content.x + 20.5 * cell.w, content.y + 3.5 * cell.h);
  await expect(tip).toBeHidden();
}

test('a run with a script pane plays back with the pane, in the log player and the HTML replay', async ({ page, browser }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const received: Buffer[] = [];
  let server: { send(b: Buffer): void; close(): Promise<void> } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await putScript(page);
  await page.keyboard.press('Enter');
  const live = page.locator(`.wc-pane[data-pane="${ID}"]`);
  await expect(live).toBeVisible();
  await expect.poll(sentText).toContain('Core.Hello');
  server!.send(gmcp('Char.Name {"name":"Paner","fullname":"Paner the Mock"}'));
  server!.send(gmcp('Char.Vitals {"hp":100,"maxhp":100,"xp":1000,"tp":10}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing · Paner/);
  server!.send(bytes('A quiet room.\r\n'));
  await page.waitForTimeout(300);
  await page.keyboard.type('pu');
  await page.keyboard.press('Enter');
  await expect(live.locator('.wc-prow').nth(2)).toHaveText(/^updated/);
  await page.waitForTimeout(300);
  server!.send(bytes('Later.\r\n'));
  await page.waitForTimeout(300);
  await server!.close();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^disconnected|^idle/);

  // The run is sealed with its SPANE records.
  const runText = (): Promise<string> =>
    page.evaluate(async () => {
      const lib = await window.__wc!.runs();
      const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.character === 'Paner');
      if (!s || s.runs.some((r) => !r.sealed)) return '';
      return (await lib.chainLog(s.runs.map((r) => r.runId)))[0]!.text;
    });
  await expect.poll(runText, { timeout: 10_000 }).toContain('\x1bSPANE rec/main {"n":');
  const text = await runText();
  const records = text.split('\n').filter((l) => l.includes('\x1bSPANE'));
  expect(records[0]).toContain('{"title":"Rec Pane","lines":[');
  console.log(`SPANE records: ${records.map((r) => r.length).join(', ')} bytes`);

  // The log player (from the start page): the pane shows the recorded content.
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  const opened = await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.character === 'Paner')!;
    return window.__wc!.openPlayer(s.id);
  });
  expect(opened).toBe(true);
  await expect(pane(page)).toBeVisible();
  await expect(pane(page).locator('.wc-pane-frame')).toContainText('Rec Pane');
  // At the start (a backward seek replays from the start): the first state.
  await page.evaluate(() => {
    const e = window.__wc!.shell.playerHost!.engine!;
    e.pause();
    e.seek(0);
  });
  await expect(prows(page).nth(0)).toHaveText(/^\[order\] other\s*$/);
  await expect(prows(page).nth(1)).toHaveText(/^\s+half\s+$/);
  await expect(prows(page).nth(2)).toHaveText(/^before/);
  await page.evaluate(() => {
    const e = window.__wc!.shell.playerHost!.engine!;
    e.seek(e.duration);
  });
  await expect(prows(page).nth(2)).toHaveText(/^updated/);
  await checkInertLink(page);
  // The viewer's gear lists it; its toggle hides it.
  await page.mouse.move(10, 10);
  await page.locator('.wc-player-gear').click();
  const toggle = page.locator(`.wc-player-toggle[data-pane="${ID}"]`);
  await expect(toggle).toHaveText('[X] Rec Pane (rec)');
  await toggle.click();
  await expect(pane(page)).toBeHidden();
  await expect(toggle).toHaveText('[ ] Rec Pane (rec)');
  expect(sentText()).not.toContain('order merc');

  // The HTML replay of the same session.
  const html = await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.character === 'Paner')!;
    return window.__wc!.replayHtml({ session: s.id });
  });
  const path = info.outputPath('pane-replay.html');
  writeFileSync(path, html);
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 }, offline: true, storageState: NO_STATE });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  const p = await context.newPage();
  const fileErrors: string[] = [];
  p.on('pageerror', (e) => fileErrors.push(e.message));
  await p.goto(`file://${path}`);
  await p.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  await expect(pane(p)).toBeVisible();
  await expect(pane(p).locator('.wc-pane-frame')).toContainText('Rec Pane');
  await p.evaluate(() => {
    const e = (window as unknown as { __wcReplay: { host: { engine: { pause(): void; seek(t: number): void; duration: number } } } }).__wcReplay.host
      .engine;
    e.pause();
    e.seek(e.duration);
  });
  await expect(prows(p).nth(2)).toHaveText(/^updated/);
  await expect(prows(p).nth(1)).toHaveText(/^\s+half\s+$/);
  await checkInertLink(p);
  expect(fileErrors).toEqual([]);
  await context.close();
  expect(errors).toEqual([]);
});
