// Lua scripts in the browser (stage 10 P1, ADR 0051): a user script put
// into IndexedDB loads when the cockpit starts, its trigger rewrites a
// line from a mocked MUME, its alias sends, and `#script disable` stops it.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const SCRIPT = `-- @name e2e
-- @api 1
echo("e2e script loaded")
tempTrigger("A rat is here.", function()
  replaceLine("A RAT is here.")
  echo("[rat spotted]")
end)
tempAlias("^rr$", function() send("kill rat") end)
`;

/** Stores an enabled user script before the cockpit (and its library) starts. */
async function putScript(page: Page): Promise<void> {
  await page.evaluate(
    (source) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('webcockpit');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('scripts', 'readwrite');
          tx.objectStore('scripts').put({ id: 'e2e-1', name: 'e2e', source, enabled: true, created: 1, updated: 1 });
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

test('a user script triggers, rewrites a line and takes an alias', async ({ page }) => {
  const received: Buffer[] = [];
  let server: { send(b: Buffer | string): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const b = typeof m === 'string' ? Buffer.from(m) : m;
      received.push(b);
      if (b.toString('latin1').includes('look\r\n')) ws.send(Buffer.from('A rat is here.\r\n'));
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('latin1');

  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  // The start page has opened (and upgraded) the database by now.
  await expect.poll(() => page.evaluate(() => new Promise((r) => {
    const q = indexedDB.open('webcockpit');
    q.onsuccess = () => {
      const ok = q.result.objectStoreNames.contains('scripts');
      q.result.close();
      r(ok);
    };
    q.onerror = () => r(false);
  }))).toBe(true);
  await putScript(page);
  await page.keyboard.press('Enter');

  const rows = page.locator('.wc-rows .wc-row');
  await expect(rows.filter({ hasText: 'e2e script loaded' })).toHaveCount(1);
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  expect(server).not.toBe(null);

  await page.keyboard.type('look');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: /^A RAT is here\.$/ })).toHaveCount(1);
  await expect(rows.filter({ hasText: /^A rat is here\.$/ })).toHaveCount(0);
  await expect(rows.last()).toHaveText('[rat spotted]');

  await page.keyboard.type('rr');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('kill rat\r\n');

  await page.keyboard.type('#script disable e2e');
  await page.keyboard.press('Enter');
  await expect(rows.filter({ hasText: '[SYSTEM] Script e2e turned off.' })).toHaveCount(1);
  await page.keyboard.type('rr');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('rr\r\n');
});
