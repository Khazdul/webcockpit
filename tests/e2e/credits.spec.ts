// Stage 47 (ADR 0132, Inv §7.6): Credits as a book, round 7's B
// "Krönikeboken". The demo backup (two characters, one spread) and a
// synthetic chronicle of several characters (many spreads): the epigraph
// and the first chapter, the turns (→ ← PgDn PgUp Space, P / N, the
// buttons), ↓ / ↑ between chapters, the pills, Home / End; no Opening
// pill, no Settings…; the filtered page with its Spotlights line (the
// filter set through `__wc.settings`); the no-data page; Esc and Back.
// The phone (one page, a touch swipe, 360 wide): phone-credits-about.spec.ts.
import { type Page, expect, test } from '@playwright/test';
import { pinDemoClock } from './demo-clock';
import { restoreChronicle } from './chronicle';
import { backTo, lookBox, morphDone, openFromMenu, openStart } from './look';

const menuSel = (page: Page) => page.locator('.wc-start .wc-frame:not([hidden]) .wc-sm-item.is-sel .wc-sm-label');
const book = (page: Page) => lookBox(page).locator('.wc-cred-book');
const pill = (page: Page, name: string) => lookBox(page).locator(`.wc-lk-seg[aria-label="Chapters"] .wc-lk-opt[data-opt="${name}"]`);
const pills = (page: Page) => lookBox(page).locator('.wc-lk-seg[aria-label="Chapters"] .wc-lk-opt');
const lit = (page: Page) => lookBox(page).locator('.wc-lk-seg[aria-label="Chapters"] .wc-lk-opt[aria-checked="true"]');
const btn = (page: Page, id: string) => lookBox(page).locator(`.wc-lk-btn[data-btn="${id}"]`);
const spread = async (page: Page): Promise<number> => Number(await book(page).getAttribute('data-spread'));

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function restoreDemo(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async () => {
    const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
    await (await w.__wc.runs()).restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
  });
}

async function setSpot(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    (p) => (window as unknown as { __wc: { settings: { update(u: unknown): void } } }).__wc.settings.update({ spotlights: p }),
    patch,
  );
}

/** Opens Credits from the menu and waits for the book (or a state page) to be laid out. */
async function openCredits(page: Page): Promise<void> {
  await openFromMenu(page, 'credits');
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');
  await morphDone(page);
}

const CHARS = ['Aragorn', 'Boromir', 'Celeborn', 'Denethor', 'Elrond'];

test('the demo book: epigraph, first chapter, title pages, drop cap, The End.; no Opening pill, no Settings…', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await openStart(page);
  await restoreDemo(page);
  await openCredits(page);
  await expect(book(page)).toHaveAttribute('data-ready', 'true');
  await expect(lookBox(page)).toHaveClass(/wc-lk-box-large/);

  // Page 1: the epigraph, then the first chapter (the character with the oldest deed).
  const first = book(page).locator('.wc-cred-ch').first();
  await expect(first.locator('.wc-cred-open')).toHaveText(/^Here the scribes have set down/);
  await expect(first).toHaveAttribute('data-ch', 'Gittan');
  await expect(first.locator('.wc-cred-title .wc-cred-name')).toHaveText(/^Gittan,?$/);
  await expect(book(page).locator('.wc-cred-ch .wc-cred-open')).toHaveCount(1);
  // Each deed: a date phrase in small caps, then the rest; the first of a chapter has the drop cap.
  await expect(first.locator('.wc-cred-p.is-first .wc-cred-date')).toHaveText(/^On the twenty-fifth of September, 2026$/);
  const cap = await first.locator('.wc-cred-p.is-first').evaluate((p) => {
    const s = getComputedStyle(p, '::first-letter');
    return { clip: s.backgroundClip || s.getPropertyValue('-webkit-background-clip'), image: s.backgroundImage };
  });
  expect(cap.image).toMatch(/gradient/);
  // The last chapter ends the book.
  await expect(book(page).locator('.wc-cred-ch').last().locator('.wc-cred-end')).toHaveText('The End.');
  await expect(book(page).locator('.wc-cred-end')).toHaveCount(1);
  // Victims as `*Name the Race*`.
  await expect(book(page)).toContainText('*Ibuki the Half-Elf*');

  // The pills: the characters only (no Opening); no Settings… anywhere.
  await expect(pills(page)).toHaveText(['Gittan', 'Rasta']);
  await expect(lookBox(page)).not.toContainText('Opening');
  await expect(lookBox(page)).not.toContainText('Settings');
  // Two pages, two folios; one spread: Previous and Next are both disabled.
  await expect(book(page)).toHaveAttribute('data-spreads', '1');
  await expect(book(page).locator('.wc-cred-folio')).toHaveText(['— 1 —', '— 2 —']);
  await expect(btn(page, 'prev')).toHaveAttribute('aria-disabled', 'true');
  await expect(btn(page, 'next')).toHaveAttribute('aria-disabled', 'true');

  // It waits for the reader: no roll, no automatic return.
  await page.waitForTimeout(1500);
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');
  await page.keyboard.press('Enter');
  await expect(lookBox(page).locator('.wc-lk-hood-t')).toHaveText('Credits');

  // Esc leaves, with the menu's cursor kept.
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Credits');
  expect(errors).toEqual([]);
});

test('turning the pages: → ← PgDn PgUp Space, P / N and the buttons, ↓ ↑ chapters, pills, Home / End', async ({ page }) => {
  test.setTimeout(60_000); // a long book (450 deeds); a loaded Firefox takes a while
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await openStart(page);
  // Long chapters: each one fills more than two spreads at this size.
  await restoreChronicle(page, CHARS, 90);
  await openCredits(page);
  await expect(book(page)).toHaveAttribute('data-ready', 'true');
  await expect(pills(page)).toHaveText(CHARS);
  const spreads = Number(await book(page).getAttribute('data-spreads'));
  expect(spreads).toBeGreaterThan(10);
  expect(await spread(page)).toBe(0);
  await expect(btn(page, 'prev')).toHaveAttribute('aria-disabled', 'true');
  await expect(btn(page, 'next')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(book(page).locator('.wc-cred-folio.is-l')).toHaveText('— 1 —');

  // → / ← and the other turning keys.
  await page.keyboard.press('ArrowRight');
  await expect(book(page)).toHaveAttribute('data-spread', '1');
  await expect(book(page).locator('.wc-cred-folio')).toHaveText(['— 3 —', '— 4 —']);
  await page.keyboard.press('ArrowLeft');
  await expect(book(page)).toHaveAttribute('data-spread', '0');
  await page.keyboard.press('PageDown');
  await expect(book(page)).toHaveAttribute('data-spread', '1');
  await page.keyboard.press('Space');
  await expect(book(page)).toHaveAttribute('data-spread', '2');
  await page.keyboard.press('PageUp');
  await expect(book(page)).toHaveAttribute('data-spread', '1');
  // P / N, and the glass buttons.
  await page.keyboard.press('n');
  await expect(book(page)).toHaveAttribute('data-spread', '2');
  await page.keyboard.press('p');
  await expect(book(page)).toHaveAttribute('data-spread', '1');
  await btn(page, 'next').click();
  await expect(book(page)).toHaveAttribute('data-spread', '2');
  await btn(page, 'prev').click();
  await expect(book(page)).toHaveAttribute('data-spread', '1');

  // Home / End; at the end Next is disabled and N does nothing.
  await page.keyboard.press('End');
  await expect(book(page)).toHaveAttribute('data-spread', String(spreads - 1));
  await expect(btn(page, 'next')).toHaveAttribute('aria-disabled', 'true');
  await expect(lit(page)).toHaveText('Elrond');
  await expect(book(page)).toContainText('The End.');
  await page.keyboard.press('n');
  await page.waitForTimeout(400);
  await expect(book(page)).toHaveAttribute('data-spread', String(spreads - 1));
  // ↓ in the last chapter has no chapter to go to: it never turns back to the chapter's start.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  await expect(book(page)).toHaveAttribute('data-spread', String(spreads - 1));
  await expect(lit(page)).toHaveText('Elrond');
  await page.keyboard.press('Home');
  await expect(book(page)).toHaveAttribute('data-spread', '0');
  await expect(btn(page, 'prev')).toHaveAttribute('aria-disabled', 'true');

  // ↓ / ↑: from chapter to chapter, the pill follows; the chapter's title page is on the spread.
  await expect(lit(page)).toHaveText('Aragorn');
  await page.keyboard.press('ArrowDown');
  await expect(lit(page)).toHaveText('Boromir');
  const s1 = await spread(page);
  expect(s1).toBeGreaterThan(0);
  await page.keyboard.press('ArrowDown');
  await expect(lit(page)).toHaveText('Celeborn');
  expect(await spread(page)).toBeGreaterThan(s1);
  await page.keyboard.press('ArrowUp');
  await expect(lit(page)).toHaveText('Boromir');
  await expect(book(page)).toHaveAttribute('data-spread', String(s1));
  // The title page of the lit chapter is in the book's visible area.
  const titleIn = async (name: string): Promise<boolean> =>
    page.evaluate((name) => {
      const b = document.querySelector('.wc-start .wc-frame:not([hidden]) .wc-cred-book')!.getBoundingClientRect();
      const t = document.querySelector(`.wc-start .wc-frame:not([hidden]) .wc-cred-ch[data-ch="${name}"] .wc-cred-title`)!.getBoundingClientRect();
      return t.left >= b.left - 1 && t.right <= b.right + 1;
    }, name);
  await expect.poll(() => titleIn('Boromir')).toBe(true);

  // A pill click jumps to its chapter's first page.
  await pill(page, 'Denethor').click();
  await expect(lit(page)).toHaveText('Denethor');
  await expect.poll(() => titleIn('Denethor')).toBe(true);
  // Turning on inside a chapter keeps its pill lit; a click on the lit pill goes back to its first page.
  const sD = await spread(page);
  await page.keyboard.press('ArrowRight');
  await expect(book(page)).toHaveAttribute('data-spread', String(sD + 1));
  await expect(lit(page)).toHaveText('Denethor');
  await expect.poll(() => titleIn('Denethor')).toBe(false);
  await pill(page, 'Denethor').click();
  await expect(book(page)).toHaveAttribute('data-spread', String(sD));
  await expect.poll(() => titleIn('Denethor')).toBe(true);

  // Back leaves.
  await backTo(page);
  await expect(menuSel(page)).toHaveText('Credits');
  expect(errors).toEqual([]);
});

test('a resize keeps the chapter; a narrow book shows one page at a time', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await pinDemoClock(page);
  await openStart(page);
  await restoreChronicle(page, CHARS, 30);
  await openCredits(page);
  await expect(book(page)).toHaveAttribute('data-ready', 'true');
  await pill(page, 'Celeborn').click();
  await expect(lit(page)).toHaveText('Celeborn');
  const wide = Number(await book(page).getAttribute('data-spreads'));

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(book(page)).toHaveClass(/is-one/);
  await expect.poll(async () => Number(await book(page).getAttribute('data-spreads'))).toBeGreaterThan(wide);
  await expect(lit(page)).toHaveText('Celeborn');
  await expect(book(page).locator('.wc-cred-folio')).toHaveCount(1);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  // One page per turn.
  const s = await spread(page);
  await page.keyboard.press('ArrowRight');
  await expect(book(page)).toHaveAttribute('data-spread', String(s + 1));
  await expect(book(page).locator('.wc-cred-folio')).toHaveText(`— ${s + 2} —`);

  // A width a fraction under 640 px (zoom, the box's percentage insets): clientWidth would round
  // it up to two pages while the CSS lays out one; the book follows the CSS.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(book(page)).not.toHaveClass(/is-one/);
  await book(page).evaluate((el) => {
    el.style.flex = '0 0 639.5px';
    el.style.maxWidth = '639.5px';
  });
  await expect(book(page)).toHaveClass(/is-one/);
  await expect(book(page).locator('.wc-cred-folio')).toHaveCount(1);
  await pill(page, 'Denethor').click();
  await expect(lit(page)).toHaveText('Denethor');
  // The chapter's title page is the page shown (its box sits at the page the measure found).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const b = document.querySelector('.wc-start .wc-frame:not([hidden]) .wc-cred-book')!.getBoundingClientRect();
        const t = document.querySelector('.wc-start .wc-frame:not([hidden]) .wc-cred-ch[data-ch="Denethor"] .wc-cred-title')!.getBoundingClientRect();
        return t.left >= b.left - 1 && t.right <= b.right + 1;
      }),
    )
    .toBe(true);

  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Credits');
  expect(errors).toEqual([]);
});

test('the filter on the Spotlights page chooses what the book tells; nothing passing is a page of its own', async ({ page }) => {
  const errors = watchErrors(page);
  await pinDemoClock(page);
  await openStart(page);
  await restoreDemo(page);

  // Gittan only: no Rasta chapter.
  await setSpot(page, { allCharacters: false, characters: ['Gittan'] });
  await openCredits(page);
  await expect(pills(page)).toHaveText(['Gittan']);
  await expect(book(page)).not.toContainText('Rasta');
  await page.keyboard.press('Escape');
  await expect(menuSel(page)).toHaveText('Credits');

  // Every kind off: the filtered page, with its Spotlights line; Back and Previous / Next stay.
  await setSpot(page, { allCharacters: true, characters: [], achievements: false, deaths: false, levelUps: false, pvp: false });
  await openCredits(page);
  await expect(book(page)).toHaveAttribute('data-state', 'filtered');
  await expect(book(page)).toContainText('No chronicle entries match your settings.');
  await expect(book(page)).toContainText('The filter on the Spotlights page chooses what the chronicle tells.');
  await expect(pills(page)).toHaveCount(0);
  await expect(btn(page, 'prev')).toHaveAttribute('aria-disabled', 'true');
  await expect(btn(page, 'next')).toHaveAttribute('aria-disabled', 'true');
  await expect(lookBox(page)).not.toContainText('Settings');
  // Keys other than Esc do nothing; Back leaves.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect(book(page)).toHaveAttribute('data-state', 'filtered');
  await backTo(page);
  await expect(menuSel(page)).toHaveText('Credits');
  expect(errors).toEqual([]);
});

test('with no runs the no-data page; Esc leaves', async ({ page }) => {
  const errors = watchErrors(page);
  await openStart(page);
  await openCredits(page);
  await expect(book(page)).toHaveAttribute('data-state', 'no_data');
  await expect(book(page)).toContainText('No chronicle yet. Your tale is written as you play');
  await expect(book(page)).not.toContainText('The filter on the Spotlights page');
  await expect(pills(page)).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(book(page)).toHaveAttribute('data-state', 'no_data');
  await backTo(page, { key: true });
  await expect(menuSel(page)).toHaveText('Credits');
  expect(errors).toEqual([]);
});
