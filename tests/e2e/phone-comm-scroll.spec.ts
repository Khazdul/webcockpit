// The phone's Comm (ADR 0136 §6) sticks to the newest message in every
// view, also for talk that came while Comm was closed (owner's report,
// 2026-11-16; ADR 0052 addendum "Live is left only by scrolling up"). The
// desktop cases are in comm-scroll.spec.ts.
//
// `phone` project (Pixel 7), against a `page.routeWebSocket` mock; the
// messages are put on the bus one per frame, as live talk comes.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const GMCP = 201;
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);

const comm = (page: Page) => page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
const list = (page: Page) => comm(page).locator('.wc-alist');
const more = (page: Page) => comm(page).locator('.wc-alist-more');
const sat = (page: Page, name: string) => page.locator(`.wc-ph-sat[data-sat="${name}"]:visible`);
const atBottom = (page: Page) => list(page).evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);

async function enterMock(page: Page): Promise<void> {
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/?phone=1');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
  await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
}

type Kind = 'public' | 'group' | 'chat';

async function feed(page: Page, kind: Kind, n: number, from = 0): Promise<void> {
  await page.evaluate(
    async ({ kind, n, from }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = from; i < from + n; i++) {
        const data =
          kind === 'public'
            ? { channel: 'tales', talker: 'Dori', 'talker-type': 'player', text: `Dori narrates 'line ${i}'` }
            : kind === 'group'
              ? { channel: 'tells', talker: 'Dori', 'talker-type': 'player', text: `Dori tells the group 'line ${i}'` }
              : { channel: 'tells', talker: 'Dori', 'talker-type': 'player', text: `line ${i}` };
        window.__wc!.app.bus.emit('gmcp', { pkg: 'Comm.Channel.Text', data } as never);
        await frame();
      }
      await frame();
      await frame();
    },
    { kind, n, from },
  );
}

for (const kind of ['public', 'group', 'chat'] as const) {
  test(`phone, ${kind}: new messages stay in view past the thread's page, and after Comm was closed`, async ({ page }) => {
    await enterMock(page);
    if (kind === 'chat') await feed(page, 'chat', 1, 9999);
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeVisible();
    await comm(page).locator(`.wc-cm-ent[data-key="${kind === 'chat' ? 'dori' : kind}"]`).tap();
    await feed(page, kind, 230);
    await expect(more(page)).toBeHidden();
    expect(await atBottom(page)).toBe(true);
    await expect(comm(page).locator('.wc-cm-item').last()).toContainText('line 229');
    await expect(comm(page).locator('.wc-cm-item').last()).toBeInViewport({ ratio: 1 });
    // Closed while talk comes; opened again at the newest.
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeHidden();
    await feed(page, kind, 20, 230);
    await sat(page, 'comm').tap();
    await expect(comm(page)).toBeVisible();
    await expect(comm(page).locator('.wc-cm-item').last()).toContainText('line 249');
    await expect.poll(() => atBottom(page)).toBe(true);
    await expect(more(page)).toBeHidden();
    await expect(comm(page).locator('.wc-cm-item').last()).toBeInViewport({ ratio: 1 });
  });
}
