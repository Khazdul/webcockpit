// `#message` and the confirmations of typed commands (ADR 0039): the row a
// typed definition gets in the game window, its colours, switching a class
// off, and the setting surviving a reload. Against a mocked MUME WebSocket.
import { type Locator, type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const msgs = (page: Page) => page.locator('.wc-rows .wc-row.wc-msg');
const color = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color);
/** A theme token as the browser resolves it for the game pane. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${n})`;
    document.querySelector('.wc-rows')!.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);
const stored = (page: Page) => page.evaluate(() => window.__wc!.shell.profiles.get('default').then((r) => r?.text ?? null));

async function enterMume(page: Page): Promise<void> {
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Profile default loaded.' })).toHaveCount(1);
}

async function type(page: Page, line: string): Promise<void> {
  await page.locator('.wc-input-field').fill(line);
  await page.keyboard.press('Enter');
}

test('a typed alias is confirmed in the editor colours; #message aliases off silences it, also after a reload', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage(() => {});
    ws.send(Buffer.concat([Buffer.from([IAC, WILL, GMCP]), Buffer.from('\r\nBy what name do you wish to be known? ')]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.evaluate(async () => {
    await window.__wc!.shell.profiles.init();
    // A user action and a highlight that would match the rows: they must not fire.
    await window.__wc!.shell.profiles.save('default', '#nop mine\n#action {smile} {#showme {FIRED}}\n#highlight {alias} {red}\n');
  });
  await enterMume(page);

  await type(page, '#alias zz {smile;grin $target}');
  const row = msgs(page).filter({ hasText: /^#alias \{zz\} \{smile;grin \$target\}$/ });
  await expect(row).toHaveCount(1);
  await expect(msgs(page)).toHaveCount(1);
  // Not game text: no [SYSTEM] prefix, no rule fired on it.
  await expect(rows(page).filter({ hasText: 'FIRED' })).toHaveCount(0);
  await expect(row.locator('.wc-f1')).toHaveCount(0);
  expect(await color(row)).toBe(await token(page, '--c-item'));
  await expect(row.locator('.wc-syn-cmd')).toHaveText('#alias');
  expect(await color(row.locator('.wc-syn-cmd'))).toBe(await token(page, '--c-syn-cmd'));
  expect(await color(row.locator('.wc-syn-brace').first())).toBe(await token(page, '--c-syn-brace'));
  expect(await color(row.locator('.wc-syn-delim'))).toBe(await token(page, '--c-syn-delim'));
  expect(await color(row.locator('.wc-syn-var'))).toBe(await token(page, '--c-syn-var'));

  // The state word is dimmer; a highlight shows its colour.
  await type(page, '#unalias nope');
  const state = msgs(page).filter({ hasText: /^#alias \{nope\} not found$/ }).locator('.wc-msg-state');
  await expect(state).toHaveText('not found');
  expect(await color(state)).toBe(await token(page, '--c-note'));
  await type(page, '#alias {tmp} {x};#unalias tmp');
  const removed = msgs(page).filter({ hasText: /^#alias \{tmp\} removed$/ }).locator('.wc-msg-state');
  expect(await color(removed)).toBe(await token(page, '--c-body'));
  await type(page, '#highlight {orc} {light red}');
  const hi = msgs(page).filter({ hasText: /^#highlight \{orc\} \{light red\}$/ }).locator('.wc-f9');
  await expect(hi).toHaveText('light red');
  expect(await color(hi)).toBe(await token(page, '--ansi-9'));

  // A long body stays on one row.
  await type(page, `#alias {long} {say ${'very '.repeat(80)}long}`);
  const long = msgs(page).filter({ hasText: /^#alias \{long\} \{say very/ });
  await expect(long).toHaveText(/…\}$/);
  const heights = await msgs(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(new Set(heights).size).toBe(1);

  await type(page, '#message aliases off');
  await expect(msgs(page).last()).toHaveText('#message {aliases} off');
  const before = await msgs(page).count();
  await type(page, '#alias {yy} {grin}');
  await type(page, '#variable {target} {orc}');
  await expect(msgs(page).last()).toHaveText('#variable {target} {orc}');
  await expect(msgs(page)).toHaveCount(before + 1);
  await expect.poll(() => stored(page)).toMatch(/#alias \{yy\} \{grin\}\n(.|\n)*#message \{aliases\} \{off\}\n/);
  await page.screenshot({ path: info.outputPath('message.png') });

  await page.reload();
  await enterMume(page);
  await type(page, '#alias {xx} {nod}');
  await type(page, '#message');
  await expect(msgs(page).filter({ hasText: /^#message \{aliases\} +off$/ })).toHaveCount(1);
  await expect(msgs(page).filter({ hasText: /^#message \{variables\} +on$/ })).toHaveCount(1);
  await expect(msgs(page)).toHaveCount(11);
  // The listing still answers, and the alias typed while silent is there.
  await type(page, '#alias {xx}');
  await expect(msgs(page).last()).toHaveText('#alias {xx} {nod}');
  await type(page, '#message aliases on');
  await expect(msgs(page).last()).toHaveText('#message {aliases} on');
  await expect.poll(() => stored(page)).not.toContain('#message');
  expect(errors).toEqual([]);
});

test('the rows are readable on the paper theme', async ({ page }) => {
  await page.goto('/?replay');
  await expect(rows(page).first()).toHaveText(/Offline replay mode/);
  await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
  await type(page, '#alias zz {smile;grin $target}');
  const row = msgs(page).filter({ hasText: /^#alias \{zz\}/ });
  await expect(row).toHaveCount(1);
  /** WCAG contrast of an element's text against the pane background. */
  const contrast = (l: Locator) =>
    l.evaluate((el) => {
      const lum = (css: string): number => {
        const c = document.createElement('canvas').getContext('2d')!;
        c.fillStyle = css;
        c.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...c.getImageData(0, 0, 1, 1).data].map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const a = lum(getComputedStyle(el).color);
      const b = lum('#f4ecd8');
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
  expect(await contrast(row)).toBeGreaterThan(7);
  for (const cls of ['.wc-syn-cmd', '.wc-syn-brace', '.wc-syn-delim', '.wc-syn-var']) {
    expect(await contrast(row.locator(cls).first()), cls).toBeGreaterThan(4.5);
  }
  await type(page, '#unalias zz;#unalias zz');
  await expect(msgs(page)).toHaveCount(3);
  expect(await contrast(msgs(page).nth(1).locator('.wc-msg-state'))).toBeGreaterThan(3.5);
  expect(await contrast(msgs(page).nth(2).locator('.wc-msg-neg'))).toBeGreaterThan(3.5);
});
