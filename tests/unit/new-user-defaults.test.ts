// New-user defaults (ADR 0078): the default layout as allocated (Character
// over Group | Timers, then Comm, UI and the pane bar; the map and the Map
// search pane floating at the game pane's top-right corner), the
// Map search float under the map, its migration, and the bundled scripts
// a new install starts with (fresh-install detection).
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { type AllocateInput, type LayoutResult, type Rect, allocate, autoFloatRect, floatBelow } from '../../src/layout/allocate';
import { setFloatRect, movePane } from '../../src/layout/model';
import { MAPSEARCH_PANE, PANEBAR_PANE, type LayoutModel, type PaneId, defaultLayout } from '../../src/layout/types';
import { SettingsStore, defaultSettings, migrateSettings } from '../../src/settings';
import { NEW_USER_SCRIPTS, ScriptLibrary } from '../../src/scripts';

const BAR = PANEBAR_PANE;
const FIND = MAPSEARCH_PANE;

/** The default settings' toggles, `on` overrides, both script panes present (their scripts run). */
function input(cols: number, rows: number, layout: LayoutModel = defaultLayout(), on: Partial<Record<PaneId, boolean>> = {}): AllocateInput {
  const panes: Partial<Record<PaneId, { on: boolean; border: boolean }>> = {};
  for (const [id, t] of Object.entries(defaultSettings().panes)) {
    panes[id as PaneId] = { on: on[id as PaneId] ?? t!.on, border: t!.border };
  }
  return { layout, panes, present: new Set<PaneId>([BAR, FIND]), cols, rows };
}

const rect = (r: LayoutResult, id: PaneId): Rect | undefined => r.panes.find((p) => p.id === id)?.rect;
const content = (r: LayoutResult, id: PaneId): Rect | undefined => r.panes.find((p) => p.id === id)?.content;

describe('default layout (ADR 0078)', () => {
  it("lays out the owner's 174 × 51 window: dock 40 wide; Character 9, the lanes 9, Comm 22, UI 4, the bar 1 row", () => {
    const r = allocate(input(174, 51));
    expect(r.hidden).toEqual([]);
    // The right dock: 40 cells after a one-cell gap.
    expect(r.docks.right!.rect).toEqual({ x: 134, y: 0, w: 40, h: 51 });
    expect(r.game).toEqual({ x: 0, y: 0, w: 133, h: 50 });
    expect(r.docks.right!.mode).toBe('scaled');
    expect(rect(r, 'character')).toEqual({ x: 134, y: 0, w: 40, h: 11 });
    // Group at the screen edge (lane 0), Timers inside it (lane 1), 20 each.
    expect(rect(r, 'group')).toEqual({ x: 154, y: 11, w: 20, h: 11 });
    expect(rect(r, 'timers')).toEqual({ x: 134, y: 11, w: 20, h: 11 });
    expect(rect(r, 'comm')).toEqual({ x: 134, y: 22, w: 40, h: 24 });
    // UI without a frame: four rows of messages; the bar the last row.
    expect(rect(r, 'ui')).toEqual({ x: 134, y: 46, w: 40, h: 4 });
    expect(r.panes.find((p) => p.id === 'ui')!.framed).toBe(false);
    expect(rect(r, BAR)).toEqual({ x: 134, y: 50, w: 40, h: 1 });
    // The map: 21 % × 27 % at the game pane's top-right corner. Map search is off.
    expect(rect(r, 'map')).toEqual({ x: 96, y: 0, w: 37, h: 14 });
    expect(rect(r, FIND)).toBeUndefined();
  });

  it('opened, Map search floats right under the map, as wide and left-aligned, 15 rows', () => {
    const r = allocate(input(174, 51, defaultLayout(), { [FIND]: true }));
    expect(rect(r, FIND)).toEqual({ x: 96, y: 14, w: 37, h: 15 });
  });

  it('Comm takes most of a taller window; every pane keeps room in a small one', () => {
    const tall = allocate(input(200, 70));
    expect(content(tall, 'comm')!.h).toBeGreaterThan(content(tall, 'group')!.h);
    expect(content(tall, 'comm')!.h).toBeGreaterThan(content(tall, 'ui')!.h * 4);
    expect(content(tall, 'character')!.h).toBe(9);
    expect(content(tall, BAR)!.h).toBe(1);
    const small = allocate(input(100, 30));
    expect(small.hidden).toEqual([]);
    for (const id of ['character', 'group', 'timers', 'comm', 'ui', BAR] as PaneId[]) expect(content(small, id)!.h).toBeGreaterThanOrEqual(1);
    expect(small.docks.right!.rect.h).toBe(30);
  });

  it('a pane switched off gives its rows to the others; Group and Timers off leave Comm the region', () => {
    const r = allocate(input(174, 51, defaultLayout(), { group: false, timers: false }));
    expect(rect(r, 'group')).toBeUndefined();
    expect(content(r, 'comm')!.h).toBeGreaterThan(22);
    expect(rect(r, BAR)).toEqual({ x: 134, y: 50, w: 40, h: 1 });
  });
});

describe('Map search under the map (FloatPane.below)', () => {
  const shown = { [FIND]: true };

  it('follows the map when the map is moved', () => {
    const m = setFloatRect(defaultLayout(), 'map', { x: 10, y: 5, w: 50, h: 20 });
    const r = allocate(input(174, 51, m, shown));
    expect(rect(r, FIND)).toEqual(floatBelow({ x: 10, y: 5, w: 50, h: 20 }, 15));
  });

  it('without a shown map float: at the top-right corner of the game pane, at its stored size', () => {
    const off = allocate(input(174, 51, defaultLayout(), { ...shown, map: false }));
    expect(rect(off, FIND)).toEqual({ x: 133 - 36, y: 0, w: 36, h: 15 });
    const docked = allocate(input(174, 51, movePane(defaultLayout(), 'map', 'left', 0, 0), shown));
    expect(rect(docked, FIND)!.y).toBe(0);
    expect(rect(docked, FIND)!.x + 36).toBe(docked.game.x + docked.game.w);
  });

  it('a short window keeps it on screen', () => {
    const r = allocate(input(174, 24, defaultLayout(), shown));
    const f = rect(r, FIND)!;
    expect(f.y + f.h).toBeLessThanOrEqual(24);
  });

  it('moved or resized it keeps its own rectangle and drops `below`', () => {
    const m = setFloatRect(defaultLayout(), FIND, { x: 3, y: 4, w: 40, h: 12 });
    expect(m.floating.find((f) => f.id === FIND)).toEqual({ id: FIND, x: 3, y: 4, w: 40, h: 12 });
  });

  it('the migration keeps `below` on an auto float only, and only a valid other pane id', () => {
    const s = migrateSettings(JSON.parse(JSON.stringify(defaultSettings())));
    expect(s.layout.floating.find((f) => f.id === FIND)).toEqual({ id: FIND, x: 0, y: 0, w: 36, h: 15, auto: true, below: 'map' });
    const bad = migrateSettings({
      layout: {
        docks: {},
        floating: [
          { id: 'x/a', x: 0, y: 0, w: 30, h: 10, auto: true, below: 'no such' },
          { id: 'x/b', x: 0, y: 0, w: 30, h: 10, below: 'map' },
          { id: 'x/c', x: 0, y: 0, w: 30, h: 10, auto: true, below: 'x/c' },
        ],
      },
    });
    for (const f of bad.layout.floating) expect('below' in f).toBe(false);
  });

  it('floatBelow and autoFloatRect agree on the map edge', () => {
    const game = { x: 0, y: 0, w: 133, h: 50 };
    const map = autoFloatRect(game, 174, 51);
    expect(floatBelow(map, 15)).toEqual({ x: map.x, y: map.y + map.h, w: map.w, h: 15 });
  });
});

const lua = (name: string): { name: string; source: string } => ({ name, source: `-- @name ${name}\n-- @api 1\n` });
const BUNDLED = [lua('panebar'), lua('mapsearch'), lua('almanac')];

describe('bundled scripts for a new user', () => {
  it('are the pane bar and Map search', () => {
    expect(NEW_USER_SCRIPTS).toEqual(['panebar', 'mapsearch']);
  });

  it('an empty library enables them once, written as records, so a reload keeps them and a later call changes nothing', async () => {
    const factory = new IDBFactory();
    const lib = new ScriptLibrary({ factory, bundled: BUNDLED });
    expect(await lib.enableForNewUser(NEW_USER_SCRIPTS)).toBe(true);
    expect(lib.enabledNames()).toEqual(['mapsearch', 'panebar']);
    await lib.setEnabled('panebar', false);
    await lib.close();
    const again = new ScriptLibrary({ factory, bundled: BUNDLED });
    expect(await again.enableForNewUser(NEW_USER_SCRIPTS)).toBe(false);
    expect(again.enabledNames()).toEqual(['mapsearch']);
    await again.close();
  });

  it('an install with script data or a user script is never changed', async () => {
    const factory = new IDBFactory();
    const lib = new ScriptLibrary({ factory, bundled: BUNDLED });
    await lib.setEnabled('almanac', true);
    await lib.setEnabled('almanac', false);
    expect(await lib.enableForNewUser(NEW_USER_SCRIPTS)).toBe(false);
    expect(lib.enabledNames()).toEqual([]);
    await lib.close();

    const user = new ScriptLibrary({ factory: new IDBFactory(), bundled: BUNDLED });
    await user.create('mine');
    expect(await user.enableForNewUser(NEW_USER_SCRIPTS)).toBe(false);
    expect(user.enabledNames()).toEqual([]);
    await user.close();
  });
});

describe('SettingsStore.fresh (fresh-install detection)', () => {
  it('is true only when IndexedDB works and holds no settings record, outside safe mode', async () => {
    const factory = new IDBFactory();
    const a = new SettingsStore({ factory, storage: null, win: null, debounceMs: 0 });
    expect(a.fresh).toBe(false); // not loaded yet
    await a.load();
    expect(a.fresh).toBe(true);
    a.update({ profile: 'pvp' });
    await a.dispose();
    const b = new SettingsStore({ factory, storage: null, win: null });
    await b.load();
    expect(b.fresh).toBe(false);
    await b.dispose();

    const mem = new SettingsStore({ factory: null, storage: null, win: null });
    await mem.load();
    expect(mem.fresh).toBe(false);
    const safe = new SettingsStore({ factory: new IDBFactory(), storage: null, win: null, safe: true });
    await safe.load();
    expect(safe.fresh).toBe(false);
    await safe.dispose();
  });

  it('a new install loads the new-user defaults', async () => {
    const factory = new IDBFactory();
    const a = new SettingsStore({ factory, storage: null, win: null });
    await a.load();
    expect(a.get()).toEqual(defaultSettings());
    await a.dispose();
  });
});
