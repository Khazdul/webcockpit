// The Comm thread sticks to the newest message in every view (Public,
// Group, a private chat) and holds a scrolled-back position without drift
// until the bottom or the `N new` row is reached (owner's report,
// 2026-11-16; ADR 0052 addendum "Live is left only by scrolling up").
//
// The messages come one per frame, as live talk does: a burst in one frame
// renders once and never showed the fault. Past `THREAD_PAGE` (200) items
// the thread is a sliding window, so every new message trims the oldest
// and gives the new first item its time separator.
import { type Locator, type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';
const comm = (page: Page) => page.locator('.wc-pane[data-pane="comm"]');
const list = (page: Page) => comm(page).locator('.wc-alist');
const more = (page: Page) => comm(page).locator('.wc-alist-more');
const entry = (page: Page, key: string) => comm(page).locator(`.wc-cm-ent[data-key="${key}"]`);
const atBottom = (box: Locator) => box.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);

async function demo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto(DEMO);
  await expect(page.locator('.wc-pane[data-pane="ui"] .wc-ui-row').filter({ hasText: 'Replay finished.' })).toHaveCount(1);
  await expect(comm(page)).toHaveAttribute('data-active', '');
  // Every channel in Public (says are off there by default, ADR 0134).
  await page.evaluate(() => window.__wc!.settings.update((d) => void (d.comm.filters = {})));
}

type Kind = 'public' | 'group' | 'chat';

/** `n` messages from Dori, one per animation frame: says (Public), group tells (Group) or tells (her chat). */
async function feed(page: Page, kind: Kind, n: number, from = 0): Promise<void> {
  await page.evaluate(
    async ({ kind, n, from }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = from; i < from + n; i++) {
        const data =
          kind === 'public'
            ? { channel: 'says', talker: 'Dori', text: `Dori says 'line ${i}'` }
            : kind === 'group'
              ? { channel: 'tells', talker: 'Dori', text: `Dori tells the group 'line ${i}'` }
              : { channel: 'tells', talker: 'Dori', text: `line ${i}` };
        window.__wc!.app.bus.emit('gmcp', { pkg: 'Comm.Channel.Text', data } as never);
        await frame();
      }
      await frame();
      await frame();
    },
    { kind, n, from },
  );
}

/** The first item at least partly in view, and its top relative to the list's (px). */
function firstInView(box: Locator): Promise<{ text: string; off: number }> {
  return box.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    for (const it of el.querySelectorAll<HTMLElement>('.wc-cm-item')) {
      const r = it.getBoundingClientRect();
      if (r.bottom > top + 1) return { text: (it.textContent ?? '').replace(/^\d\d:\d\d/, ''), off: r.top - top };
    }
    return { text: '', off: 0 };
  });
}

async function openView(page: Page, kind: Kind): Promise<void> {
  // The chat opens with Dori's first tell; Public and Group are pinned.
  if (kind === 'chat') await feed(page, 'chat', 1, 9999);
  await entry(page, kind === 'chat' ? 'dori' : kind).click();
  await expect(entry(page, kind === 'chat' ? 'dori' : kind)).toHaveAttribute('aria-pressed', 'true');
}

for (const kind of ['public', 'group', 'chat'] as const) {
  test(`${kind}: new messages one per frame stay in view past the thread's page`, async ({ page }) => {
    await demo(page);
    await openView(page, kind);
    await feed(page, kind, 240);
    await expect(more(page)).toBeHidden();
    expect(await atBottom(list(page))).toBe(true);
    await expect(comm(page).locator('.wc-cm-item').last()).toContainText('line 239');
    await expect(comm(page).locator('.wc-cm-item').last()).toBeInViewport({ ratio: 1 });
    // And it keeps following.
    await feed(page, kind, 30, 240);
    await expect(more(page)).toBeHidden();
    expect(await atBottom(list(page))).toBe(true);
    await expect(comm(page).locator('.wc-cm-item').last()).toContainText('line 269');
  });

  test(`${kind}: scrolled back holds its place while messages arrive and old ones are trimmed`, async ({ page }) => {
    await demo(page);
    await openView(page, kind);
    await feed(page, kind, 230);
    await list(page).hover();
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(400);
    await expect(more(page)).toBeVisible();
    const before = await firstInView(list(page));
    await feed(page, kind, 25, 230);
    const after = await firstInView(list(page));
    expect(after.text).toBe(before.text);
    expect(Math.abs(after.off - before.off)).toBeLessThanOrEqual(1);
    await expect(more(page)).toBeVisible();
    // The `N new` row returns to the newest, and it follows again.
    await more(page).click();
    await feed(page, kind, 5, 255);
    await expect(more(page)).toBeHidden();
    expect(await atBottom(list(page))).toBe(true);
    await expect(comm(page).locator('.wc-cm-item').last()).toContainText('line 259');
  });
}

test('scrolled back in one view, another view opens at its newest and follows', async ({ page }) => {
  await demo(page);
  await openView(page, 'public');
  await feed(page, 'public', 60);
  await list(page).hover();
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
  await expect(more(page)).toBeVisible();
  await openView(page, 'group');
  await feed(page, 'group', 60);
  await expect(more(page)).toBeHidden();
  expect(await atBottom(list(page))).toBe(true);
});

test('messages that arrive while the search covers the thread are in view when it closes', async ({ page }) => {
  await demo(page);
  await openView(page, 'public');
  await feed(page, 'public', 60);
  await comm(page).locator('.wc-cm-sbtn').click();
  await page.keyboard.type('zzz');
  await feed(page, 'public', 30, 60);
  await page.keyboard.press('Escape');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(more(page)).toBeHidden();
  expect(await atBottom(list(page))).toBe(true);
  await expect(comm(page).locator('.wc-cm-item').last()).toContainText('line 89');
});
