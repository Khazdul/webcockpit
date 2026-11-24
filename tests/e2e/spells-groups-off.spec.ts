// The Spells pane's Herblores, Buffs and Debuffs off once where the
// Character pane is on (ADR 0166 point 172, addendum 30). The owner's test
// server held a stored record that the step of settings version 8 never
// switched: the switch is now keyed by its own mark (`timers.stonesOff`,
// settings version 9), not by the version. These specs seed a realistic
// stored record the way the app stores it (IndexedDB `webcockpit` /
// `settings` / `main`, plus the appearance mirror), load the cockpit and
// read the gear's Shown switches.
import { type Page, expect, test } from '@playwright/test';

const DEMO = '/?fixture=gmcp-demo.log&speed=0';

test.use({ viewport: { width: 1400, height: 1100 } });

const THREE = [
  ['herb', 'Herblores'],
  ['buff', 'Buffs'],
  ['debuff', 'Debuffs'],
] as const;

/**
 * The suite's stored record (Character on in the right dock, Spells on)
 * rewritten as one from before the mark: `version`, every group on, no
 * `stonesOff`, Character as given. The mirror is written as the app does.
 */
async function seed(page: Page, version: number, characterOn: boolean): Promise<void> {
  await page.goto('/?replay');
  await page.waitForFunction(() => window.__wc !== undefined);
  const got = await page.evaluate(
    async ([version, characterOn]) => {
      await window.__wc!.settings.load();
      await window.__wc!.settings.flush();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('webcockpit');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      type Rec = {
        version: number;
        appearance: unknown;
        panes: { character: { on: boolean }; timers: { on: boolean } };
        layout: { docks: { right: { lanes: { panes: { id: string }[] }[] } } };
        timers: { groups: Record<string, { enabled: boolean }>; stonesOff?: boolean };
      };
      const v = await new Promise<Rec>((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        const os = tx.objectStore('settings');
        const r = os.get('main');
        let rec!: Rec;
        r.onsuccess = () => {
          rec = r.result as Rec;
          rec.version = version;
          rec.panes.character.on = characterOn;
          rec.panes.timers.on = true;
          for (const g of Object.values(rec.timers.groups)) g.enabled = true;
          delete rec.timers.stonesOff;
          os.put(rec, 'main');
        };
        tx.oncomplete = () => resolve(rec);
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      localStorage.setItem('webcockpit.appearance', JSON.stringify(v.appearance));
      const docked = v.layout.docks.right.lanes.flatMap((l) => l.panes.map((p) => p.id));
      return { version: v.version, character: v.panes.character.on, docked, groups: v.timers.groups.herb!.enabled };
    },
    [version, characterOn] as const,
  );
  expect(got).toMatchObject({ version, character: characterOn, groups: true });
  expect(got.docked).toEqual(expect.arrayContaining(['character', 'timers']));
}

async function cockpit(page: Page): Promise<void> {
  await page.goto(DEMO);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}

async function openGear(page: Page) {
  await page.locator('.wc-pane-timers').hover();
  await page.locator('.wc-pane-timers > .wc-pane-btn-gear').click();
  const pop = page.locator('.wc-sp-gear-timers');
  await expect(pop).toBeVisible();
  return pop;
}

const shown = (pop: ReturnType<Page['locator']>, name: string) => pop.getByRole('switch', { name: `Show ${name}` });

for (const version of [7, 8]) {
  test(`a stored v${version} record with Character docked: Herblores, Buffs and Debuffs are not shown in Spells; one turned on again stays on`, async ({ page }) => {
    await seed(page, version, true);
    await cockpit(page);
    await expect(page.locator('.wc-pane[data-pane="character"]')).toBeVisible();
    let pop = await openGear(page);
    for (const [, name] of THREE) await expect(shown(pop, name)).toHaveAttribute('aria-checked', 'false');
    await expect(shown(pop, 'Spells')).toHaveAttribute('aria-checked', 'true');
    // Turned on again: kept over a reload.
    await shown(pop, 'Buffs').click();
    await expect(shown(pop, 'Buffs')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => window.__wc!.settings.flush());
    await cockpit(page);
    pop = await openGear(page);
    await expect(shown(pop, 'Buffs')).toHaveAttribute('aria-checked', 'true');
    await expect(shown(pop, 'Herblores')).toHaveAttribute('aria-checked', 'false');
    expect(await page.evaluate(() => window.__wc!.settings.get().timers.stonesOff)).toBe(true);
  });
}

test('Character off: the groups stay as stored; Character turned on later takes them off once', async ({ page }) => {
  await seed(page, 8, false);
  await cockpit(page);
  let pop = await openGear(page);
  for (const [, name] of THREE) await expect(shown(pop, name)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__wc!.settings.update({ panes: { character: { on: true } } }));
  await expect(page.locator('.wc-pane[data-pane="character"]')).toBeVisible();
  pop = await openGear(page);
  for (const [, name] of THREE) await expect(shown(pop, name)).toHaveAttribute('aria-checked', 'false');
});

test('the sync path: a pulled v7 record (an old client elsewhere) reloads with the three off', async ({ page }) => {
  await seed(page, 9, true);
  await cockpit(page);
  // The record carries the mark now? Not this seed: a v9 without it counts as marked, so all on.
  expect(await page.evaluate(() => window.__wc!.settings.get().timers.groups.herb.enabled)).toBe(true);
  // The sync writes the account's v7 record and calls reload (ADR 0152).
  const after = await page.evaluate(async () => {
    const s = window.__wc!.settings;
    const rec = JSON.parse(JSON.stringify(s.get())) as { version: number; timers: { stonesOff?: boolean; groups: Record<string, { enabled: boolean }> } };
    rec.version = 7;
    delete rec.timers.stonesOff;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('webcockpit');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(rec, 'main');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const r = await s.reload();
    const g = s.get().timers.groups;
    return { r, three: [g.herb.enabled, g.buff.enabled, g.debuff.enabled] };
  });
  expect(after).toEqual({ r: 'applied', three: [false, false, false] });
  const pop = await openGear(page);
  for (const [, name] of THREE) await expect(shown(pop, name)).toHaveAttribute('aria-checked', 'false');
});
