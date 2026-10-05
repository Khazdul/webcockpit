// An existing install for the e2e suite (ADR 0078). The specs were
// written for the defaults before ADR 0078 (DejaVu 15, one right-dock
// lane, the UI framed, no bundled script on), which is also what an
// existing user keeps. `globalSetup` stores those settings once through
// the app (safe mode, so no new-user scripts are enabled) and saves the
// browser storage, IndexedDB included; every project starts from it
// (`use.storageState`). A spec that tests a new install starts from an
// empty state instead (new-user.spec.ts).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type FullConfig, chromium } from '@playwright/test';
import { legacySettings } from '../unit/legacy-defaults';

/** The saved storage state (cookies, localStorage and IndexedDB of the dev origin). */
export const LEGACY_STATE = 'test-results/.state/legacy.json';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]!.use.baseURL!;
  mkdirSync(dirname(LEGACY_STATE), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/?replay&safe');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async (legacy) => {
    const s = (window as unknown as { __wc: { settings: { load(): Promise<void>; update(f: (d: object) => void): void; flush(): Promise<void> } } }).__wc.settings;
    await s.load();
    s.update((d) => {
      Object.assign(d, legacy);
    });
    await s.flush();
  }, legacySettings());
  await context.storageState({ path: LEGACY_STATE, indexedDB: true });
  await browser.close();
}

/** No storage at all: a file:// page (the HTML replay) that must not touch the dev origin. */
export const NO_STATE = { cookies: [], origins: [] };
