import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openWebcockpitDb } from '../../src/core/db';
import { lazyDb } from '../../src/panes/context';
import { TimersArchive } from '../../src/timers/archive';

const NOW = 1_790_000_000_000;

describe('TimersArchive', () => {
  it('saves one record per character and replaces it', async () => {
    const db = await openWebcockpitDb(new IDBFactory());
    let now = NOW;
    const a = new TimersArchive(db, { now: () => now });
    expect(await a.load('Rasta')).toBeNull();
    await a.save('Rasta', { v: 1, trackers: { blinds: [{ name: 'orc' }] } });
    await a.save('Gibur', { v: 1, trackers: {} });
    now += 1000;
    await a.save('Rasta', { v: 1, trackers: { blinds: [] } });
    expect(await a.load('Rasta')).toEqual({ character: 'Rasta', savedAt: NOW + 1000, state: { v: 1, trackers: { blinds: [] } } });
    expect((await a.load('Gibur'))?.savedAt).toBe(NOW);
    expect(await a.load('rasta')).toBeNull();
    db.close();
  });

  it('lists, puts as given and removes (the sync, ADR 0152); a save notes `timers`, a put does not', async () => {
    const { onStored } = await import('../../src/core/store-events');
    const db = await openWebcockpitDb(new IDBFactory());
    const a = new TimersArchive(db, { now: () => NOW });
    const kinds: string[] = [];
    const off = onStored((k) => kinds.push(k));
    expect(await a.list()).toEqual([]);
    await a.save('Rasta', { v: 1, trackers: {} });
    expect(kinds).toEqual(['timers']);
    await a.put({ character: 'Gibur', savedAt: NOW - 5000, state: { v: 1, trackers: { x: 1 } } });
    await expect(a.put({ savedAt: 1 } as never)).rejects.toThrow(TypeError);
    expect(kinds).toEqual(['timers']);
    off();
    expect(await a.list()).toEqual([
      { character: 'Gibur', savedAt: NOW - 5000, state: { v: 1, trackers: { x: 1 } } },
      { character: 'Rasta', savedAt: NOW, state: { v: 1, trackers: {} } },
    ]);
    await a.remove('Rasta');
    await a.remove('Nobody');
    expect((await a.list()).map((r) => r.character)).toEqual(['Gibur']);
    expect(await a.load('Rasta')).toBeNull();
    db.close();
  });

  it('opens through the lazy opener and rejects without IndexedDB', async () => {
    const a = await TimersArchive.open(lazyDb(new IDBFactory()));
    await a.save('Rasta', null);
    expect((await a.load('Rasta'))?.state).toBeNull();
    await expect(TimersArchive.open(lazyDb(null))).rejects.toThrow();
  });
});
