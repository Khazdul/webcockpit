// Stage 74 part C (ADR 0165): the start menu's panel morphs to a sub-page's
// normal box and back, as every other pair of boxes does (a `swap`: the
// menu's items fade, the proxy flies from the panel to the box, the
// content fades in; the wordmark moves with the flight). Until this stage
// the page changed at once.
//
// - menu → Profile → Back: the plan runs, the proxy lands on the box as it
//   is (the list's content comes a moment after the mount), a box or the
//   proxy is drawn on every frame, the wordmark never lies over the frame;
// - menu → Log in: the name field has the focus from the mount, and what
//   is typed during the flight goes to it;
// - Back mid-flight turns the proxy round from where it is; open and Back
//   in a row end on the menu;
// - reduced motion: the two boxes fade, nothing flies.
//
// The phone (the proxy in pieces, our keyboard, a tall box):
// phone-menu-sub-morph.spec.ts. Against the fake account API,
// `?cloudtest`. Nothing reaches MUME.
import { type Page, expect, test } from '@playwright/test';
import { DESKTOP, accountRow, field, frame, openStart, pageOf, watchErrors } from './account-pages';
import { fakeAccountApi } from './cloud-account-fake';
import { morphDone, morphProxy, reducedMotion } from './look';
import { blanks, brandOverFrame, edgesOf, landingGap, startMorphWatch, stopMorphWatch, watchMorph } from './menu-morph';

test.use({ viewport: DESKTOP });

const PANEL = '.wc-start .wc-frame:not([hidden]) .wc-sm-panel';
const SUB = '.wc-start .wc-frame:not([hidden]) .wc-lk-sub > .wc-lk-box';
const row = (page: Page, key: string) => page.locator(`.wc-start .wc-frame:not([hidden]) .wc-sm-item[data-key="${key}"]`);

async function open(page: Page, query = ''): Promise<void> {
  await fakeAccountApi(page);
  await openStart(page, query);
  await page.mouse.move(1, 1);
  await expect(accountRow(page)).toBeVisible();
}

for (const how of ['', '&morph=pieces'] as const) {
  test(`menu → Profile → Back morphs: the proxy lands on the box, a frame is always drawn, the wordmark keeps clear${how ? ' (the proxy in pieces)' : ''}`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, how);
    const panel = await edgesOf(page, PANEL);

    const there = await watchMorph(page, () => row(page, 'profile').click());
    expect(there.plans, 'menu → Profile').toEqual(['swap']);
    expect(there.flew, 'the proxy flew').toBe(true);
    expect(there.blank, blanks(there)).toBe(0);
    expect(brandOverFrame(there), 'the wordmark over the frame').toEqual([]);
    await expect(page.locator(SUB)).toBeVisible();
    const box = await edgesOf(page, SUB);
    expect(box[2] - box[0], 'a normal box is wider than the panel').toBeGreaterThan(panel[2] - panel[0] + 100);
    // The Profile list's box grows a moment after its mount: the proxy lands on the box as it is.
    expect(landingGap(there, box), 'the proxy landed on the box').toBeLessThan(2);
    await expect(page.locator('.wc-start')).toHaveClass(/\bis-sub\b/);
    await expect(page.locator(`${SUB} > .wc-lk-win > *`).first()).toHaveCSS('opacity', '1');

    const back = await watchMorph(page, () => page.keyboard.press('Escape'));
    expect(back.plans, 'Profile → menu').toEqual(['swap']);
    expect(back.flew).toBe(true);
    expect(back.blank, blanks(back)).toBe(0);
    expect(brandOverFrame(back)).toEqual([]);
    await expect(page.locator(PANEL)).toBeVisible();
    expect(landingGap(back, await edgesOf(page, PANEL)), 'the proxy landed on the panel').toBeLessThan(2);
    expect(await edgesOf(page, PANEL), 'the panel is where it was').toEqual(panel);
    await expect(page.locator('.wc-start')).toHaveClass(/\bis-main\b/);
    await expect(row(page, 'profile')).toHaveCSS('opacity', '1');
    await expect(page.locator('.wc-start .wc-sm-quote')).toHaveCSS('opacity', '1');
    await expect(page.locator('.wc-start .wc-frame')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test('menu → Log in morphs; the name field has the focus from the mount and takes what is typed during the flight', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await startMorphWatch(page);
  await accountRow(page).click();
  // The page is mounted (hidden until its landing): its field has the focus, and keys go to it.
  await expect(page.locator('.wc-start')).toHaveAttribute('data-lk-morph', 'swap');
  await expect(field(page, 'name')).toBeFocused();
  await page.keyboard.type('Olev');
  await morphDone(page);
  const w = await stopMorphWatch(page);
  expect(w.plans).toEqual(['swap']);
  expect(w.flew).toBe(true);
  expect(w.blank, blanks(w)).toBe(0);
  expect(brandOverFrame(w)).toEqual([]);
  // From the first frame of the plan to the last, the focus is the field's.
  const planned = w.frames.filter((f) => f.plan);
  expect(planned.length).toBeGreaterThan(5);
  expect([...new Set(planned.map((f) => f.focus))]).toEqual(['input[name]']);
  await expect(pageOf(page, 'login')).toBeVisible();
  await expect(field(page, 'name')).toHaveValue('Olev');
  await expect(field(page, 'name')).toBeFocused();
  expect(landingGap(w, await edgesOf(page, SUB))).toBeLessThan(2);

  const back = await watchMorph(page, () => frame(page).locator('.wc-lk-back').click());
  expect(back.plans).toEqual(['swap']);
  expect(back.flew).toBe(true);
  expect(back.blank, blanks(back)).toBe(0);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(accountRow(page)).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('Back mid-flight turns the proxy round from where it is; open and Back in a row end on the menu', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const panel = await edgesOf(page, PANEL);
  await startMorphWatch(page);
  // The click, and Esc on the first frame the proxy has left the panel by 20 px (one task of the
  // page). Two frames later the new flight is read: the rectangle its first keyframe starts from.
  const turn = await page.evaluate(
    ({ left }) =>
      new Promise<{ at: number[]; from: number[] | null }>((done) => {
        const px = document.querySelector<HTMLElement>('.wc-lk-morph')!;
        const tick = (): void => {
          const r = px.getBoundingClientRect();
          if (px.hidden || getComputedStyle(px).visibility !== 'visible' || left - r.left <= 20) return void requestAnimationFrame(tick);
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const first = px
                .getAnimations()
                .map((a) => (a.effect as KeyframeEffect).getKeyframes()[0] as unknown as Record<string, string>)
                .find((k) => k && typeof k['left'] === 'string' && typeof k['width'] === 'string');
              done({
                at: [r.left, r.top, r.width, r.height],
                from: first ? ['left', 'top', 'width', 'height'].map((k) => Number.parseFloat(first[k]!)) : null,
              });
            }),
          );
        };
        document.querySelector<HTMLElement>('.wc-start .wc-sm-item[data-key="profile"]')!.click();
        requestAnimationFrame(tick);
      }),
    { left: panel[0] },
  );
  await morphDone(page);
  const w = await stopMorphWatch(page);
  expect(w.plans).toEqual(['swap']);
  // The flight back starts from the rectangle the proxy had when Esc came (not from the box's).
  expect(turn.from, 'the flight back').not.toBeNull();
  for (let i = 0; i < 4; i++) expect(Math.abs(turn.from![i]! - turn.at[i]!), `the proxy turned round where it was (${turn.from} from ${turn.at})`).toBeLessThan(1.5);
  expect(panel[0] - turn.at[0]!, 'it had left the panel').toBeGreaterThan(20);
  expect(w.blank, blanks(w)).toBe(0);
  await expect(page.locator(PANEL)).toBeVisible();
  expect(landingGap(w, panel)).toBeLessThan(2);
  expect(await edgesOf(page, PANEL)).toEqual(panel);
  await expect(row(page, 'profile')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start')).toHaveClass(/\bis-main\b/);
  await expect(page.locator('.wc-start .wc-frame')).toHaveCount(1);

  // Open and Back three times, each as soon as the page is there.
  for (let i = 0; i < 3; i++) {
    await row(page, 'profile').click();
    await expect(page.locator(SUB)).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(page.locator(PANEL)).toBeAttached();
  }
  await morphDone(page);
  await expect(page.locator(PANEL)).toBeVisible();
  expect(await edgesOf(page, PANEL)).toEqual(panel);
  await expect(row(page, 'profile')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start .wc-sm-quote')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start')).toHaveClass(/\bis-main\b/);
  await expect(page.locator('.wc-start .wc-frame')).toHaveCount(1);
  // The wordmark is the menu's full one again.
  await expect(page.locator('.wc-start-brand')).toHaveCSS('transform', 'none');
  expect(errors).toEqual([]);
});

// One clock for every morph (ADR 0165 addendum): the large pairs at the quick tempo.
test('menu → About → Back on the one clock: the proxy lands on the box, a frame is always drawn, the wordmark is gone before the frame reaches it and back after it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const panel = await edgesOf(page, PANEL);
  const LARGE = '.wc-start .wc-frame:not([hidden]) .wc-lk-large > .wc-lk-box';

  const there = await watchMorph(page, () => row(page, 'about').click());
  expect(there.plans).toEqual(['open']);
  expect(there.flew).toBe(true);
  expect(there.blank, blanks(there)).toBe(0);
  expect(brandOverFrame(there), 'the wordmark over the frame, opening').toEqual([]);
  await expect(page.locator(LARGE)).toBeVisible();
  expect(landingGap(there, await edgesOf(page, LARGE))).toBeLessThan(2);
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '0');
  await expect(page.locator('.wc-start-almanac')).toHaveCSS('opacity', '0');

  const back = await watchMorph(page, () => page.keyboard.press('Escape'));
  expect(back.plans).toEqual(['close']);
  expect(back.flew).toBe(true);
  expect(back.blank, blanks(back)).toBe(0);
  expect(brandOverFrame(back), 'the wordmark over the frame, closing').toEqual([]);
  await expect(page.locator(PANEL)).toBeVisible();
  expect(landingGap(back, panel)).toBeLessThan(2);
  // Nothing of the scenery is still on its way once the plan has ended.
  await expect(page.locator('.wc-start')).not.toHaveAttribute('data-lk-morph', /./);
  expect(await page.locator('.wc-start-scenery').evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && !/color|shadow/.test((a as CSSTransition).transitionProperty ?? '')).length)).toBe(0);
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start-brand')).toHaveCSS('transform', 'none');
  await expect(page.locator('.wc-start-almanac')).toHaveCSS('opacity', '1');
  await expect(row(page, 'about')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('Back mid-flight on the way to a large box turns the proxy round from where it is', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const panel = await edgesOf(page, PANEL);
  await startMorphWatch(page);
  const turn = await page.evaluate(
    ({ left }) =>
      new Promise<{ at: number[]; from: number[] | null }>((done) => {
        const px = document.querySelector<HTMLElement>('.wc-lk-morph')!;
        const tick = (): void => {
          const r = px.getBoundingClientRect();
          if (px.hidden || getComputedStyle(px).visibility !== 'visible' || left - r.left <= 40) return void requestAnimationFrame(tick);
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const first = px
                .getAnimations()
                .map((a) => (a.effect as KeyframeEffect).getKeyframes()[0] as unknown as Record<string, string>)
                .find((k) => k && typeof k['left'] === 'string' && typeof k['width'] === 'string');
              done({
                at: [r.left, r.top, r.width, r.height],
                from: first ? ['left', 'top', 'width', 'height'].map((k) => Number.parseFloat(first[k]!)) : null,
              });
            }),
          );
        };
        document.querySelector<HTMLElement>('.wc-start .wc-sm-item[data-key="about"]')!.click();
        requestAnimationFrame(tick);
      }),
    { left: panel[0] },
  );
  await morphDone(page);
  const w = await stopMorphWatch(page);
  expect(w.plans).toEqual(['open', 'close']);
  expect(turn.from, 'the flight back').not.toBeNull();
  for (let i = 0; i < 4; i++) expect(Math.abs(turn.from![i]! - turn.at[i]!), `the proxy turned round where it was (${turn.from} from ${turn.at})`).toBeLessThan(1.5);
  expect(w.blank, blanks(w)).toBe(0);
  await expect(page.locator(PANEL)).toBeVisible();
  expect(landingGap(w, panel)).toBeLessThan(2);
  await expect(page.locator('.wc-start')).toHaveClass(/\bis-main\b/);
  await expect(page.locator('.wc-start-brand')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start-brand')).toHaveCSS('transform', 'none');
  await expect(row(page, 'about')).toHaveCSS('opacity', '1');
  await expect(page.locator('.wc-start .wc-frame')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('reduced motion: menu ↔ Profile fades the two boxes, nothing flies', async ({ page }) => {
  await reducedMotion(page);
  await open(page);
  const there = await watchMorph(page, () => row(page, 'profile').click());
  expect(there.plans).toEqual(['fade']);
  expect(there.flew).toBe(false);
  await expect(page.locator(SUB)).toBeVisible();
  await expect(page.locator(SUB)).toHaveCSS('opacity', '1');
  const back = await watchMorph(page, () => page.keyboard.press('Escape'));
  expect(back.plans).toEqual(['fade']);
  expect(back.flew).toBe(false);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(morphProxy(page)).toBeHidden();
});
