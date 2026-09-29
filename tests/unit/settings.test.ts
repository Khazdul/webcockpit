import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureStore } from '../../src/capture/store';
import { DB_NAME, DB_VERSION, openWebcockpitDb } from '../../src/core/db';
import { EVEN_SHARE_DESIRED, PANE_IDS, defaultMapFloat } from '../../src/layout/types';
import {
  DEFAULT_SETTINGS,
  MIRROR_KEY,
  SettingsStore,
  defaultSettings,
  migrateComm,
  migrateTimers,
  migrateSpotlights,
  defaultTimersSettings,
  TIMER_COLOR_HEX,
  migrateGroup,
  migrateSettings,
  readAppearanceMirror,
  viewSnapshot,
} from '../../src/settings';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

class FakeWin extends EventTarget {}

const stores: SettingsStore[] = [];
function make(opts: { factory: IDBFactory; storage?: Storage; safe?: boolean; win?: FakeWin }) {
  const s = new SettingsStore({
    factory: opts.factory,
    storage: opts.storage ?? new MemStorage(),
    win: (opts.win ?? null) as unknown as Window | null,
    safe: opts.safe ?? false,
    debounceMs: 20,
  });
  stores.push(s);
  return s;
}

afterEach(async () => {
  for (const s of stores.splice(0)) await s.dispose();
  vi.useRealTimers();
});

async function stored(factory: IDBFactory): Promise<unknown> {
  const db = await openWebcockpitDb(factory);
  const r = db.transaction('settings').objectStore('settings').get('main');
  const v = await new Promise((res) => (r.onsuccess = () => res(r.result)));
  db.close();
  return v;
}

describe('migrateSettings', () => {
  it('returns the defaults for garbage', () => {
    for (const raw of [undefined, null, 42, 'x', [], {}]) {
      expect(migrateSettings(raw)).toEqual(defaultSettings());
    }
  });

  it('default layout: right dock 33 wide, Cockpit order, Character 9 and even shares (ADR 0023)', () => {
    const r = DEFAULT_SETTINGS.layout.docks.right;
    expect(r.size).toBe(33);
    expect(r.panes).toEqual(
      ['character', 'timers', 'group', 'comm', 'ui'].map((id) => ({
        id,
        desired: id === 'character' ? 9 : EVEN_SHARE_DESIRED,
      })),
    );
    expect(DEFAULT_SETTINGS.layout.docks.left.panes).toEqual([]);
    expect(DEFAULT_SETTINGS.panes.timers).toEqual({ on: true, color: 'black', border: true });
    expect(Object.isFrozen(DEFAULT_SETTINGS.appearance.ansi)).toBe(true);
  });

  it('fills missing keys and clamps values', () => {
    const s = migrateSettings({
      appearance: { size: 99, padding: 13, fg: '#ABC', bg: 'nope', ansi: ['#123456'], cursorStyle: 'x' },
      panes: { ui: { on: false, color: 'pink' } },
      corners: 'block',
      profile: '',
    });
    expect(s.appearance.size).toBe(32);
    expect(s.appearance.padding).toBe(12);
    expect(s.appearance.fg).toBe('#aabbcc');
    expect(s.appearance.bg).toBe('#000000');
    expect(s.appearance.ansi[0]).toBe('#123456');
    expect(s.appearance.ansi[15]).toBe('#ffffff');
    expect(s.appearance.ansi).toHaveLength(16);
    expect(s.appearance.cursorStyle).toBe('beam');
    expect(s.appearance.font).toBe('dejavu');
    expect(s.panes.ui).toEqual({ on: false, color: 'black', border: true });
    // The removed corner style setting is dropped silently.
    expect('corners' in s).toBe(false);
    expect(s.profile).toBe('default');
    expect(migrateSettings({ appearance: { size: 1, padding: -4 } }).appearance).toMatchObject({
      size: 6,
      padding: 0,
    });
  });

  it('input colour: Steel by default and for older data, kept when valid (ADR 0035)', () => {
    expect(DEFAULT_SETTINGS.appearance.inputColor).toBe('steel');
    expect(migrateSettings({ appearance: { fg: '#808080' } }).appearance.inputColor).toBe('steel');
    expect(migrateSettings({}).appearance.inputColor).toBe('steel');
    expect(migrateSettings({ appearance: { inputColor: 'amber' } }).appearance.inputColor).toBe('amber');
    expect(migrateSettings({ appearance: { inputColor: 'none' } }).appearance.inputColor).toBe('none');
    expect(migrateSettings({ appearance: { inputColor: 'pink' } }).appearance.inputColor).toBe('steel');
    expect(migrateSettings({ appearance: { inputColor: 3 } }).appearance.inputColor).toBe('steel');
  });

  it('adds the group and comm options with defaults (older stored data)', () => {
    const old = { appearance: {}, panes: {}, layout: DEFAULT_SETTINGS.layout, profile: 'pvp' };
    const s = migrateSettings(old);
    expect(s.group).toEqual({ showPlayers: true, npcMode: 'labeled' });
    expect(s.comm).toEqual({ filters: {}, showHeader: true });
    expect(s.profile).toBe('pvp');
  });

  it('checks group and comm values; comm filters keep only disabled channels', () => {
    const s = migrateSettings({
      group: { showPlayers: 'no', npcMode: 'some' },
      comm: {
        filters: { tells: false, says: true, narrates: 0, '': false, ['x'.repeat(65)]: false, yells: false },
        showHeader: false,
      },
    });
    expect(s.group).toEqual({ showPlayers: true, npcMode: 'labeled' });
    expect(s.comm).toEqual({ filters: { tells: false, yells: false }, showHeader: false });
    expect(migrateGroup({ showPlayers: false, npcMode: 'all' })).toEqual({ showPlayers: false, npcMode: 'all' });
    expect(migrateComm({ filters: [false] }).filters).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`c${i}`, false]));
    expect(Object.keys(migrateComm({ filters: many }).filters)).toHaveLength(100);
  });

  it('a comm filter is re-enabled by patching it to true', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    store.update({ comm: { filters: { tells: false, says: false } } });
    expect(store.get().comm.filters).toEqual({ tells: false, says: false });
    store.update({ comm: { filters: { tells: true } } });
    expect(store.get().comm.filters).toEqual({ says: false });
    store.update({ group: { npcMode: 'all' } });
    expect(store.get().group).toEqual({ showPlayers: true, npcMode: 'all' });
  });

  it('adds the timers options with defaults (Inv §2.6.3)', () => {
    const s = migrateSettings({ appearance: {}, profile: 'pvp' });
    expect(s.timers).toEqual(defaultTimersSettings());
    expect(s.timers.groups.blind).toEqual({ enabled: true, color: 'cyan', cols: 2, clock: false, bar: true });
    expect(s.timers.groups.charm).toMatchObject({ color: 'violet', cols: 1 });
    expect(Object.values(s.timers.groups).map((g) => g.cols)).toEqual([4, 4, 4, 4, 2, 1]);
    expect(s.timers.headers).toBe(true);
    expect(s.timers.compact).toBe(true);
    expect(TIMER_COLOR_HEX.violet).toBe('#b388ff');
  });

  it('checks timers values per key and clamps the column caps', () => {
    const t = migrateTimers({
      groups: {
        spell: { enabled: false, color: 'orange', cols: 9, clock: true, bar: false },
        buff: { enabled: 'no', color: 'yellow', cols: 0, clock: 1 },
        charm: { cols: 5 },
        stored: 'junk',
        bogus: { cols: 3 },
      },
      headers: false,
      compact: 'x',
    });
    expect(t.groups.spell).toEqual({ enabled: false, color: 'orange', cols: 6, clock: true, bar: false });
    expect(t.groups.buff).toEqual({ enabled: true, color: 'green', cols: 1, clock: false, bar: true });
    expect(t.groups.charm.cols).toBe(2);
    expect(t.groups.stored).toEqual(defaultTimersSettings().groups.stored);
    expect(Object.keys(t.groups)).toEqual(['spell', 'buff', 'debuff', 'stored', 'blind', 'charm']);
    expect(t.headers).toBe(false);
    expect(t.compact).toBe(true);
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    store.update({ timers: { groups: { debuff: { cols: 3 } } } });
    expect(store.get().timers.groups.debuff).toMatchObject({ cols: 3, color: 'red' });
  });

  it('adds the Spotlights filters with defaults and checks each key (Inv §3.8)', () => {
    expect(migrateSettings({ profile: 'x' }).spotlights).toEqual({ achievements: true, deaths: true, levelUps: true, pvp: true });
    expect(migrateSpotlights({ deaths: false, pvp: 'no', levelUps: 0 })).toEqual({
      achievements: true,
      deaths: false,
      levelUps: true,
      pvp: true,
    });
    expect(migrateSpotlights(null)).toEqual(defaultSettings().spotlights);
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    store.update({ spotlights: { achievements: false } });
    expect(store.get().spotlights).toMatchObject({ achievements: false, deaths: true });
  });

  it('viewSnapshot picks the screen settings', () => {
    const v = viewSnapshot(DEFAULT_SETTINGS);
    expect(Object.keys(v).sort()).toEqual(['appearance', 'comm', 'group', 'layout', 'panes', 'timers']);
    expect(v.layout).toBe(DEFAULT_SETTINGS.layout);
  });

  it('repairs a damaged layout: duplicates, unknown ids, missing panes', () => {
    const s = migrateSettings({
      layout: {
        docks: {
          left: { size: 20, panes: [{ id: 'comm', desired: 12 }, { id: 'bogus', desired: 3 }] },
          right: { size: -5, panes: [{ id: 'comm', desired: 4 }, { id: 'ui' }] },
        },
      },
    });
    expect(s.layout.docks.left).toEqual({ size: 20, panes: [{ id: 'comm', desired: 12 }] });
    expect(s.layout.docks.right.size).toBe(1);
    expect(s.layout.docks.right.panes.map((p) => p.id)).toEqual(['ui', 'character', 'timers', 'group']);
    expect(s.layout.docks.right.panes[0]).toEqual({ id: 'ui', desired: 5 });
    expect(s.layout.docks.bottom).toEqual({ size: 10, panes: [] });
    // Layouts stored before the top dock existed get an empty one.
    expect(s.layout.docks.top).toEqual({ size: 10, panes: [] });
    const all = Object.values(s.layout.docks).flatMap((d) => d.panes.map((p) => p.id));
    // The map floats at its default spot (ADR 0020).
    expect(s.layout.floating).toEqual([defaultMapFloat()]);
    expect([...all, 'map'].sort()).toEqual([...PANE_IDS].sort());
  });
});

describe('migrateLayout: floating panes', () => {
  it('keeps valid floating panes, repairs bad ones and keeps every pane once', () => {
    const s = migrateSettings({
      layout: {
        docks: { right: { size: 33, panes: [{ id: 'character', desired: 9 }, { id: 'timers', desired: 8 }] } },
        floating: [
          { id: 'comm', x: 4, y: 2, w: 30, h: 12 },
          { id: 'character', x: 1, y: 1, w: 10, h: 10 }, // already docked: dropped
          { id: 'group', x: -3, y: 'x', w: 0 }, // repaired
          { id: 'comm', x: 9, y: 9, w: 9, h: 9 }, // duplicate
          { id: 'nope', x: 1, y: 1, w: 1, h: 1 },
          'garbage',
        ],
      },
    });
    expect(s.layout.floating).toEqual([
      defaultMapFloat(),
      { id: 'comm', x: 4, y: 2, w: 30, h: 12 },
      { id: 'group', x: 0, y: 0, w: 1, h: 8 },
    ]);
    expect(s.layout.docks.right.panes.map((p) => p.id)).toEqual(['character', 'timers', 'ui']);
    expect(s.layout.docks.top).toEqual({ size: 10, panes: [] });
  });

  it('gives an older layout a floating list with only the map and a top dock', () => {
    const s = migrateSettings({ layout: { docks: { right: { size: 40, panes: [] } } } });
    expect(s.layout.floating).toEqual([defaultMapFloat()]);
    expect(s.layout.docks.top.panes).toEqual([]);
    expect(s.layout.docks.right.size).toBe(40);
  });
});

describe('database', () => {
  it('upgrades a version-1 capture database without losing runs', async () => {
    const factory = new IDBFactory();
    // Create a v1 database as stage 1 did.
    await new Promise<void>((resolve, reject) => {
      const r = factory.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const runs = r.result.createObjectStore('runs', { keyPath: 'runId' });
        runs.createIndex('character', 'character');
        runs.createIndex('startedUs', 'startedUs');
        r.result.createObjectStore('runChunks', { keyPath: ['runId', 'seq'] });
        runs.put({ runId: 'A/1', character: 'A', startedUs: 1, endedUs: null, sealed: false, bytes: 0, lines: 0 });
      };
      r.onsuccess = () => {
        r.result.close();
        resolve();
      };
      r.onerror = () => reject(r.error);
    });
    const cap = await CaptureStore.open(factory);
    expect(cap.db.version).toBe(DB_VERSION);
    expect([...cap.db.objectStoreNames].sort()).toEqual(['comm', 'exports', 'mapIds', 'maps', 'profiles', 'runChunks', 'runEvents', 'runs', 'settings', 'timers']);
    expect((await cap.listRuns()).map((r) => r.runId)).toEqual(['A/1']);
    cap.close();
  });
});

describe('SettingsStore', () => {
  it('starts with defaults, updates by patch and by draft, notifies', async () => {
    const s = make({ factory: new IDBFactory() });
    await s.load();
    expect(s.get()).toEqual(defaultSettings());
    expect(s.persistent).toBe(true);
    const seen: Array<[number, number]> = [];
    const off = s.subscribe((n, p) => seen.push([n.appearance.size, p.appearance.size]));
    s.update({ appearance: { size: 18 } });
    s.update((d) => {
      d.panes.ui.on = false;
    });
    s.update((d) => ({ appearance: { size: d.appearance.size + 1 } }));
    expect(s.get().appearance.size).toBe(19);
    expect(s.get().panes.ui.on).toBe(false);
    expect(s.get().appearance.fg).toBe('#c0c0c0');
    expect(seen).toEqual([
      [18, 15],
      [18, 18],
      [19, 18],
    ]);
    // No-op updates do not notify; values are clamped.
    s.update({ appearance: { size: 19 } });
    expect(seen).toHaveLength(3);
    s.update({ appearance: { size: 100 } });
    expect(s.get().appearance.size).toBe(32);
    off();
    s.update({ appearance: { size: 10 } });
    expect(seen).toHaveLength(4);
    expect(Object.isFrozen(s.get().panes.ui)).toBe(true);
  });

  it('arrays in a patch replace the whole array', async () => {
    const s = make({ factory: new IDBFactory() });
    await s.load();
    s.update({ layout: { docks: { right: { panes: [{ id: 'ui', desired: 7 }] } } } });
    const right = s.get().layout.docks.right;
    expect(right.size).toBe(33);
    // The migration re-adds the panes the patch left out.
    expect(right.panes[0]).toEqual({ id: 'ui', desired: 7 });
    expect(right.panes).toHaveLength(5);
  });

  it('persists debounced, reloads, and mirrors appearance', async () => {
    const factory = new IDBFactory();
    const storage = new MemStorage();
    const a = make({ factory, storage });
    await a.load();
    a.update({ appearance: { bg: '#f4ecd8', font: 'jetbrains' }, profile: 'pvp' });
    expect(readAppearanceMirror(storage)?.bg).toBe('#f4ecd8');
    expect(await stored(factory)).toBeUndefined();
    await new Promise((r) => setTimeout(r, 60));
    expect((await stored(factory)) as { profile: string }).toMatchObject({ profile: 'pvp' });

    const b = make({ factory, storage: new MemStorage() });
    // Before load: nothing from IndexedDB yet, no mirror → defaults.
    expect(b.get().appearance.bg).toBe('#000000');
    let calls = 0;
    b.subscribe(() => calls++);
    await b.load();
    expect(b.get().appearance.bg).toBe('#f4ecd8');
    expect(b.get().profile).toBe('pvp');
    expect(calls).toBe(1);
  });

  it('uses the localStorage mirror for the first paint', () => {
    const storage = new MemStorage();
    storage.setItem(MIRROR_KEY, JSON.stringify({ size: 22, bg: '#0e141c' }));
    const s = make({ factory: new IDBFactory(), storage });
    expect(s.get().appearance.size).toBe(22);
    expect(s.get().appearance.bg).toBe('#0e141c');
    expect(s.get().appearance.fg).toBe('#c0c0c0');
    storage.setItem(MIRROR_KEY, '{not json');
    expect(readAppearanceMirror(storage)).toBeNull();
  });

  it('flushes on pagehide', async () => {
    const factory = new IDBFactory();
    const win = new FakeWin();
    const s = new SettingsStore({ factory, storage: null, win: win as unknown as Window, debounceMs: 250 });
    stores.push(s);
    await s.load();
    s.update({ profile: 'hidden' });
    win.dispatchEvent(new Event('pagehide'));
    await s.flush();
    expect(await stored(factory)).toMatchObject({ profile: 'hidden' });
  });

  it('safe mode: default appearance, nothing saved until a change', async () => {
    const factory = new IDBFactory();
    const storage = new MemStorage();
    const a = make({ factory, storage });
    await a.load();
    a.update({ appearance: { size: 32 }, panes: { comm: { color: 'grey' } } });
    await a.flush();

    const safeStorage = new MemStorage();
    safeStorage.setItem(MIRROR_KEY, JSON.stringify({ size: 32 }));
    const b = make({ factory, storage: safeStorage, safe: true });
    expect(b.get().appearance.size).toBe(15);
    await b.load();
    expect(b.isSafe).toBe(true);
    expect(b.get().appearance.size).toBe(15);
    expect(b.get().panes.comm.color).toBe('grey');
    await b.flush();
    expect(await stored(factory)).toMatchObject({ appearance: { size: 32 } });
    expect(readAppearanceMirror(safeStorage)?.size).toBe(32);

    b.update({ appearance: { padding: 4 } });
    await b.flush();
    expect(await stored(factory)).toMatchObject({ appearance: { size: 15, padding: 4 } });
    expect(readAppearanceMirror(safeStorage)).toMatchObject({ size: 15, padding: 4 });
  });

  it('replays changes made while loading on top of the stored data', async () => {
    const factory = new IDBFactory();
    const a = make({ factory });
    await a.load();
    a.update({ profile: 'stored' });
    await a.flush();

    const b = make({ factory });
    const p = b.load();
    b.update({ appearance: { size: 20 } });
    await p;
    expect(b.get().appearance.size).toBe(20);
    expect(b.get().profile).toBe('stored');
    await b.flush();
    expect(await stored(factory)).toMatchObject({ appearance: { size: 20 }, profile: 'stored' });
  });

  it('works in memory without IndexedDB', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = make({ factory: null as unknown as IDBFactory });
    await s.load();
    expect(s.persistent).toBe(false);
    s.update({ appearance: { size: 20 } });
    await s.flush();
    expect(s.get().appearance.size).toBe(20);
    warn.mockRestore();
  });
});
