// A page at a given device pixel ratio, in both browsers.
//
// Firefox drops a context's deviceScaleFactor on the app page, which is
// cross-origin isolated (COOP/COEP, vite.config.ts): devicePixelRatio reads
// 1 there. For a ratio other than 1 the Firefox page therefore lives in a
// browser launched with the `layout.css.devPixelsPerPx` pref. Tests call
// `expectDpr` to be sure.
import { type Page, expect, test } from '@playwright/test';

/** `dprPage`: a page at pixel ratio `dpr` (an option: `dprTest.use({ dpr })`). */
export const dprTest = test.extend<{ dpr: number; dprPage: Page }>({
  dpr: [1, { option: true }],
  dprPage: async ({ dpr, browserName, browser, baseURL }, use) => {
    const own =
      browserName === 'firefox' && dpr !== 1
        ? await browser.browserType().launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(dpr) } })
        : null;
    const ctx = await (own ?? browser).newContext({ deviceScaleFactor: dpr, ...(baseURL ? { baseURL } : {}) });
    await use(await ctx.newPage());
    await ctx.close();
    await own?.close();
  },
});

export async function expectDpr(page: Page, dpr: number): Promise<void> {
  expect(await page.evaluate(() => devicePixelRatio)).toBe(dpr);
}
