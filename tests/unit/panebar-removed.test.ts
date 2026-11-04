// The bundled pane bar script was removed (ADR 0111): an existing install
// loses its script data and the `panebar/bar` pane (layout and toggles)
// once; a fresh install never had them; settings of the new version, and
// a user script that later takes the name, are left alone.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { STORE, openWebcockpitDb } from '../../src/core/db';
import { DOCK_IDS, type LayoutModel, type PaneId, defaultLayout, defaultStatsFloat, dockPanes } from '../../src/layout/types';
import { BUNDLED_SCRIPTS, NEW_USER_SCRIPTS, ScriptLibrary } from '../../src/scripts';
import { SETTINGS_KEY, SETTINGS_VERSION, SettingsStore, defaultSettings, migrateSettings } from '../../src/settings';
import { RETIRED_PANES } from '../../src/settings/migrate';
import { adr0078Layout } from './legacy-defaults';

const BAR = 'panebar/bar' as PaneId;
const BAR_TOGGLE = { on: true, color: 'black', border: false, glass: true } as const;

/** Every pane id the layout holds: docks (head, lanes, tail) and floats. */
const ids = (m: LayoutModel): PaneId[] => [...DOCK_IDS.flatMap((d) => dockPanes(m.docks[d]).map((p) => p.id)), ...m.floating.map((f) => f.id)];

/** Settings as a version-2 install stored them: the ADR 0078 layout with the bar last in the right dock's tail. */
function storedV2(): Record<string, unknown> {
  const s = JSON.parse(JSON.stringify(defaultSettings())) as Record<string, unknown> & { panes: Record<string, unknown>; layout: LayoutModel };
  s.version = 2;
  s.layout = adr0078Layout();
  s.layout.docks.right.tail.push({ id: BAR, desired: 1 });
  s.panes[BAR] = { ...BAR_TOGGLE };
  s.panes['mine/main'] = { on: true, color: 'red', border: true, glass: true };
  return s;
}

describe('settings: the pane bar is dropped from settings stored before version 3', () => {
  it('is listed as retired at version 3 (the current version is newer)', () => {
    expect(RETIRED_PANES).toEqual([{ id: BAR, version: 3 }]);
    expect(SETTINGS_VERSION).toBeGreaterThanOrEqual(3);
  });

  it('drops the bar from the right dock and from the toggles; everything else stays', () => {
    const raw = storedV2();
    const s = migrateSettings(raw);
    expect(s.version).toBe(SETTINGS_VERSION);
    expect(ids(s.layout)).not.toContain(BAR);
    expect(s.layout.docks.right.tail.map((p) => p.id)).toEqual(['comm', 'ui']);
    expect('panebar/bar' in s.panes).toBe(false);
    // Another script pane keeps its toggle; the rest of the layout is the stored one (plus the Statistics float, ADR 0109).
    expect(s.panes['mine/main']).toEqual({ on: true, color: 'red', border: true, glass: true });
    const want = adr0078Layout();
    want.floating.push(defaultStatsFloat());
    expect(s.layout).toEqual(want);
  });

  it('drops it from a float, from a lane of its own (no empty lane left) and from the anchor of a float below it', () => {
    const raw = storedV2();
    const layout = raw.layout as LayoutModel;
    layout.docks.right.tail.pop();
    layout.docks.bottom.lanes = [{ size: 1, panes: [{ id: BAR, desired: 80 }] }];
    const s = migrateSettings(raw);
    expect(ids(s.layout)).not.toContain(BAR);
    expect(s.layout.docks.bottom.lanes).toEqual([]);

    const floated = storedV2();
    const fl = floated.layout as LayoutModel;
    fl.docks.right.tail.pop();
    fl.floating.push({ id: BAR, x: 3, y: 4, w: 40, h: 1 }, { id: 'mine/main', x: 0, y: 0, w: 30, h: 8, auto: true, below: BAR });
    const f = migrateSettings(floated);
    expect(f.layout.floating.map((x) => x.id)).toEqual(['map', 'mapsearch/main', 'mine/main', 'statistics']);
    expect(f.layout.floating.find((x) => x.id === 'mine/main')).toEqual({ id: 'mine/main', x: 0, y: 0, w: 30, h: 8, auto: true });
  });

  it('settings without a version (the oldest, or damaged) drop it too', () => {
    const raw = storedV2();
    delete raw.version;
    const s = migrateSettings(raw);
    expect(ids(s.layout)).not.toContain(BAR);
    expect('panebar/bar' in s.panes).toBe(false);
  });

  it('is idempotent, and settings of version 3 keep a pane of that id (a user script named panebar made later)', () => {
    const once = migrateSettings(storedV2());
    expect(migrateSettings(JSON.parse(JSON.stringify(once)))).toEqual(once);
    const v3 = JSON.parse(JSON.stringify(once)) as Record<string, unknown> & { panes: Record<string, unknown>; layout: LayoutModel };
    v3.panes[BAR] = { ...BAR_TOGGLE };
    v3.layout.docks.bottom.lanes = [{ size: 1, panes: [{ id: BAR, desired: 80 }] }];
    const kept = migrateSettings(v3);
    expect(kept.panes[BAR]).toEqual(BAR_TOGGLE);
    expect(kept.layout.docks.bottom.lanes).toEqual([{ size: 1, panes: [{ id: BAR, desired: 80 }] }]);
  });

  it('a fresh install has no bar: not in the default layout, the toggles or the bundle', () => {
    expect(ids(defaultLayout())).not.toContain(BAR);
    expect('panebar/bar' in defaultSettings().panes).toBe(false);
    expect(BUNDLED_SCRIPTS.map((b) => b.name)).not.toContain('panebar');
    expect(NEW_USER_SCRIPTS).not.toContain('panebar');
  });

  it('SettingsStore: a stored version-2 record loads without the bar and is saved as version 3 on the next change', async () => {
    const factory = new IDBFactory();
    const db = await openWebcockpitDb(factory);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE.settings, 'readwrite');
      tx.objectStore(STORE.settings).put(storedV2(), SETTINGS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const a = new SettingsStore({ factory, storage: null, win: null, debounceMs: 0 });
    await a.load();
    expect(a.fresh).toBe(false);
    expect(ids(a.get().layout)).not.toContain(BAR);
    expect('panebar/bar' in a.get().panes).toBe(false);
    a.update({ profile: 'pvp' });
    await a.dispose();
    const b = new SettingsStore({ factory, storage: null, win: null });
    await b.load();
    expect(b.get().version).toBe(SETTINGS_VERSION);
    expect(ids(b.get().layout)).not.toContain(BAR);
    expect(b.get().profile).toBe('pvp');
    await b.dispose();
  });
});

const lua = (name: string): { name: string; source: string } => ({ name, source: `-- @name ${name}\n-- @api 1\n` });
/** The bundle as a release before ADR 0111 had it, and as it is now. */
const OLD = [lua('panebar'), lua('mapsearch')];
const NOW = [lua('mapsearch')];

/** The stored `scriptData` record names. */
async function dataNames(factory: IDBFactory): Promise<string[]> {
  const db = await openWebcockpitDb(factory);
  const names = await new Promise<string[]>((resolve, reject) => {
    const r = db.transaction(STORE.scriptData, 'readonly').objectStore(STORE.scriptData).getAllKeys();
    r.onsuccess = () => resolve((r.result as string[]).slice().sort());
    r.onerror = () => reject(r.error);
  });
  db.close();
  return names;
}

describe('script library: the removed panebar script leaves nothing behind', () => {
  it('panebar is retired by default and no longer bundled', async () => {
    const lib = new ScriptLibrary({ factory: null });
    await lib.init();
    expect(lib.get('panebar')).toBeNull();
  });

  it("an installed, enabled panebar: its data record (enabled flag, settings, store) is deleted at init; other scripts' data stays", async () => {
    const factory = new IDBFactory();
    const old = new ScriptLibrary({ factory, bundled: OLD, retired: [] });
    await old.setEnabled('panebar', true);
    await old.setEnabled('mapsearch', true);
    old.storeSet('panebar', 'x', 1);
    await old.close();
    expect(await dataNames(factory)).toEqual(['mapsearch', 'panebar']);

    const lib = new ScriptLibrary({ factory, bundled: NOW });
    await lib.init();
    expect(lib.get('panebar')).toBeNull();
    expect(lib.enabledNames()).toEqual(['mapsearch']);
    expect(lib.storeGet('panebar', 'x')).toBeUndefined();
    expect(lib.backupRecords().data.map((d) => d.name)).toEqual(['mapsearch']);
    await lib.close();
    expect(await dataNames(factory)).toEqual(['mapsearch']);

    // Idempotent: a second start finds nothing to do.
    const again = new ScriptLibrary({ factory, bundled: NOW });
    await again.init();
    expect(again.enabledNames()).toEqual(['mapsearch']);
    await again.close();
    expect(await dataNames(factory)).toEqual(['mapsearch']);
  });

  it('a duplicated copy (panebar-copy) is a user script and is kept, enabled, with its data', async () => {
    const factory = new IDBFactory();
    const old = new ScriptLibrary({ factory, bundled: OLD, retired: [] });
    const copy = await old.duplicate('panebar');
    expect(copy.name).toBe('panebar-copy');
    await old.setEnabled('panebar-copy', true);
    old.storeSet('panebar-copy', 'k', 'v');
    await old.close();

    const lib = new ScriptLibrary({ factory, bundled: NOW });
    await lib.init();
    expect(lib.get('panebar-copy')).toMatchObject({ bundled: false, enabled: true });
    expect(lib.storeGet('panebar-copy', 'k')).toBe('v');
    await lib.close();
  });

  it('a user script named panebar (made after the removal) keeps its data', async () => {
    const factory = new IDBFactory();
    const lib = new ScriptLibrary({ factory, bundled: NOW });
    await lib.create('panebar');
    lib.storeSet('panebar', 'k', 2);
    await lib.close();
    const again = new ScriptLibrary({ factory, bundled: NOW });
    await again.init();
    expect(again.get('panebar')).toMatchObject({ bundled: false });
    expect(again.storeGet('panebar', 'k')).toBe(2);
    await again.close();
  });

  it('a fresh install: nothing to delete, and the new-user scripts are still enabled once', async () => {
    const factory = new IDBFactory();
    const lib = new ScriptLibrary({ factory, bundled: NOW });
    expect(await lib.enableForNewUser(NEW_USER_SCRIPTS)).toBe(true);
    expect(lib.enabledNames()).toEqual(['mapsearch']);
    await lib.close();
    expect(await dataNames(factory)).toEqual(['mapsearch']);
  });
});
