// A phone whose window is not its screen (stage 55): the browser's "Desktop
// site" mode. The test runner's `viewport` option sets the screen too, so the
// context is made by hand: the `phone` project's device with the window
// (`viewport`) and the screen given apart.
import { type Browser, type BrowserContext, type Page, devices, test } from '@playwright/test';

/** A phone's screen (Pixel 7, CSS px). */
export const PHONE_SCREEN = { width: 412, height: 915 };
/** The window Android Chrome's "Desktop site" lays the page out in on that screen. */
export const DESKTOP_SITE_WINDOW = { width: 980, height: 1743 };

export interface PhoneScreenOptions {
  viewport: { width: number; height: number };
  /** Default: the project's stored state (an existing install); `'new'` is a first visit. */
  storage?: 'new';
}

/** A page of a touch browser on a phone's screen with `viewport` as its window; close the context when done. */
export async function phoneScreenPage(browser: Browser, o: PhoneScreenOptions): Promise<{ context: BrowserContext; page: Page }> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: o.viewport,
    screen: PHONE_SCREEN,
    ...(use.baseURL ? { baseURL: use.baseURL } : {}),
    storageState: o.storage === 'new' ? { cookies: [], origins: [] } : use.storageState,
  });
  return { context, page: await context.newPage() };
}
