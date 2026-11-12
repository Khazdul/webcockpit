// The input colour's default (ADR 0035, addendum of 2026-11-12): Amber, the
// gold, for a new install on a computer too. The typed line, its prompt, the
// command's echo and the password's bullets have it; it reads at 4.5 : 1 on
// the terminal's ground, dark and Paper (the bullets at 3 : 1 on the tint a
// selected password stands on); the suggestion's grey and the selection's inverted look are
// apart from it. An existing install keeps the colour it has stored
// (live-mock.spec.ts: Steel). Against a mocked MUME: nothing reaches the
// real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

// A new install: nothing stored.
test.use({ storageState: { cookies: [], origins: [] } });

const IAC = 255;
const WILL = 251;
const WONT = 252;
const SB = 250;
const SE = 240;
const GMCP = 201;
const ECHO = 1;
const bytes = (...parts: (number[] | string)[]): Buffer => Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));

type Rgb = [number, number, number];

/** A CSS colour as sRGB, resolved by the browser (`color-mix()`, `oklab()`), over `under` where it is not opaque. */
function resolve(page: Page, color: string, under: Rgb = [0, 0, 0]): Promise<Rgb> {
  return page.evaluate(
    ([color, under]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d')!;
      g.fillStyle = `rgb(${under.join(',')})`;
      g.fillRect(0, 0, 1, 1);
      g.fillStyle = color;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!] as [number, number, number];
    },
    [color, under] as const,
  );
}

const colorOf = async (page: Page, l: Locator, pseudo?: string): Promise<Rgb> => resolve(page, await l.evaluate((el, p) => getComputedStyle(el, p ?? null).color, pseudo));

function ratio(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb): number => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    }) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

for (const theme of ['dark', 'paper'] as const) {
  test(`a new install types in Amber (${theme}): the line, the prompt, the echo and the password's bullets; 4.5 : 1 on the ground; apart from the suggestion and the selection`, async ({ page }) => {
    let server: { send(b: Buffer): void } | null = null;
    await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
      server = ws;
      ws.send(bytes([IAC, WILL, GMCP]));
    });
    await page.goto('/');
    await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
    expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('amber');
    if (theme === 'paper') await page.evaluate(() => window.__wc!.settings.update({ appearance: { bg: '#f4ecd8', fg: '#000000' } }));
    await page.keyboard.press('Enter');
    await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
    server!.send(bytes([IAC, SB, GMCP], 'Char.Name {"name":"Tester","fullname":"Tester the Mock"}', [IAC, SE]));
    await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
    await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });

    const field = page.locator('.wc-input-field');
    const prompt = page.locator('.wc-input-prompt');
    await page.keyboard.type('look');
    await page.keyboard.press('Enter');
    const echo = page.locator('.wc-rows .wc-echo').filter({ hasText: 'look' }).last();
    await expect(echo).toBeVisible();
    // The setting's own mix for this ground: 15 % of the text colour with the amber.
    const fg = theme === 'paper' ? '#000000' : await page.evaluate(() => window.__wc!.settings.get().appearance.fg);
    const want = await resolve(page, `color-mix(in oklab, ${fg} 15%, ${theme === 'paper' ? '#9a5a00' : '#ffaf00'})`);
    const bg = await resolve(page, await page.evaluate(() => window.__wc!.settings.get().appearance.bg));
    const gold = await colorOf(page, field);
    expect(gold).toEqual(want);
    expect(await colorOf(page, prompt)).toEqual(gold);
    expect(await colorOf(page, echo)).toEqual(gold);
    // Gold, not the old light blue; readable on the terminal's ground.
    expect(gold[0]).toBeGreaterThan(gold[2] + 40);
    console.log(`[53k] desktop ${theme}: typed text rgb(${gold.join(', ')}) on rgb(${bg.join(', ')}), ${ratio(gold, bg).toFixed(2)} : 1`);
    expect(ratio(gold, bg)).toBeGreaterThanOrEqual(4.5);
    // The sent line stays selected (the desktop's look after a send): the selection is the text
    // colour's inverse, whatever the input colour is.
    const sel = await field.evaluate((el) => {
      const st = getComputedStyle(el, '::selection');
      return [st.color, st.backgroundColor];
    });
    expect(ratio(await resolve(page, sel[0]!), await resolve(page, sel[1]!))).toBeGreaterThanOrEqual(4.5);
    // The suggestion (the rest of a history entry) is the muted grey, apart from the typed gold.
    await page.keyboard.type('lo');
    const ghost = page.locator('.wc-input-ghost');
    // (Shown or not, by the suggestions' own setting: its colour is the rule's.)
    await expect(ghost).toHaveCount(1);
    const grey = await colorOf(page, ghost);
    expect(grey).not.toEqual(gold);
    expect(Math.abs(grey[0] - grey[2])).toBeLessThan(30);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');

    // A password prompt: the bullets are gold, on the ground and on the tint of a selection.
    server!.send(bytes([IAC, WILL, ECHO], '\r\nPassword: '));
    await expect(field).toHaveClass(/wc-masked/);
    await page.keyboard.type('hunter2');
    const mask = page.locator('.wc-input-mask');
    await expect(mask).toHaveText('•••••••');
    expect(await colorOf(page, mask)).toEqual(gold);
    await page.keyboard.press('ControlOrMeta+a');
    const tint = await resolve(page, await field.evaluate((el) => getComputedStyle(el, '::selection').backgroundColor), bg);
    // (Bullets are marks, not letters: 3 : 1. On Paper the tint is a third ink, and the gold is 3.1 : 1 on it; 8.9 : 1 on dark.)
    expect(ratio(gold, tint)).toBeGreaterThanOrEqual(3);
    server!.send(bytes([IAC, WONT, ECHO]));
  });
}
