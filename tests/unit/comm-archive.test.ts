import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, openWebcockpitDb } from '../../src/core/db';
import { COMM_RETENTION_MS, CommArchive, type NewCommRecord } from '../../src/gmcp/comm-archive';
import { lazyDb } from '../../src/panes/context';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_790_000_000_000;

function msg(character: string, ts: number, text: string, extra: Partial<NewCommRecord> = {}): NewCommRecord {
  return { character, ts, channel: 'tells', talker: 'Gibur', talkerType: 'player', destination: null, text, ...extra };
}

async function open(now = () => NOW) {
  const factory = new IDBFactory();
  const db = await openWebcockpitDb(factory);
  return { factory, db, archive: new CommArchive(db, { now }) };
}

describe('CommArchive', () => {
  it('appends with increasing seq and loads a character oldest first', async () => {
    const { archive, db } = await open();
    const a = await archive.append(msg('Rasta', NOW - 3000, 'one'));
    const b = await archive.append(msg('Rasta', NOW - 2000, 'two', { talker: 'you', destination: 'Dori' }));
    await archive.append(msg('Gittan', NOW - 1500, 'other char'));
    await archive.append(msg('Rasta', NOW - 1000, 'three'));
    expect(b).toBeGreaterThan(a);
    const got = await archive.loadRecent('Rasta');
    expect(got.map((r) => r.text)).toEqual(['one', 'two', 'three']);
    expect(got[1]).toMatchObject({ talker: 'you', destination: 'Dori', seq: b, character: 'Rasta' });
    expect((await archive.loadRecent('Gittan')).map((r) => r.text)).toEqual(['other char']);
    expect(await archive.loadRecent('Nobody')).toEqual([]);
    db.close();
  });

  it('writes the appends of one task in one transaction, in order', async () => {
    const { archive, db } = await open();
    const real = db.transaction.bind(db);
    const modes: string[] = [];
    db.transaction = ((names: string | string[], mode?: IDBTransactionMode) => {
      modes.push(mode ?? 'readonly');
      return real(names, mode);
    }) as typeof db.transaction;
    const ps = [0, 1, 2, 3].map((i) => archive.append(msg('Rasta', NOW - 100 + i, `b${i}`)));
    // A read in the same task sees them.
    const seen = archive.loadRecent('Rasta');
    const seqs = await Promise.all(ps);
    expect(seqs).toEqual([seqs[0], seqs[0]! + 1, seqs[0]! + 2, seqs[0]! + 3]);
    expect((await seen).map((r) => [r.text, r.seq])).toEqual(seqs.map((q, i) => [`b${i}`, q]));
    expect(modes).toEqual(['readwrite', 'readonly']);
    // A later task gets its own transaction.
    await archive.append(msg('Rasta', NOW, 'later'));
    expect(modes).toEqual(['readwrite', 'readonly', 'readwrite']);
    db.close();
  });

  it('rejects every append of a batch when the database is closed', async () => {
    const { archive, db } = await open();
    db.close();
    const ps = [archive.append(msg('Rasta', NOW, 'a')), archive.append(msg('Rasta', NOW, 'b'))];
    for (const p of ps) await expect(p).rejects.toThrow();
  });

  it('loads only the newest N within 7 days; equal times keep insertion order', async () => {
    const { archive, db } = await open();
    await archive.append(msg('Rasta', NOW - 8 * DAY, 'too old'));
    for (let i = 0; i < 5; i++) await archive.append(msg('Rasta', NOW - 10, `m${i}`));
    expect((await archive.loadRecent('Rasta', 3)).map((r) => r.text)).toEqual(['m2', 'm3', 'm4']);
    expect((await archive.loadRecent('Rasta')).map((r) => r.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
    expect(await archive.loadRecent('Rasta', 0)).toEqual([]);
    db.close();
  });

  it('prunes everything older than 7 days, for every character', async () => {
    let now = NOW;
    const { archive, db } = await open(() => now);
    await archive.append(msg('Rasta', NOW - COMM_RETENTION_MS - 1, 'old R'));
    await archive.append(msg('Gittan', NOW - 9 * DAY, 'old G'));
    await archive.append(msg('Rasta', NOW - COMM_RETENTION_MS, 'edge'));
    await archive.append(msg('Rasta', NOW, 'new'));
    expect(await archive.prune()).toBe(2);
    expect((await archive.loadRecent('Rasta')).map((r) => r.text)).toEqual(['edge', 'new']);
    now = NOW + DAY;
    expect(await archive.prune()).toBe(1);
    expect(await archive.prune()).toBe(0);
    db.close();
  });

  it('opens through a lazy opener and upgrades a version-2 database', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const r = factory.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const runs = r.result.createObjectStore('runs', { keyPath: 'runId' });
        runs.createIndex('character', 'character');
        runs.createIndex('startedUs', 'startedUs');
        r.result.createObjectStore('runChunks', { keyPath: ['runId', 'seq'] });
        r.result.createObjectStore('settings');
        const p = r.result.createObjectStore('profiles', { keyPath: 'name' });
        p.put({ name: 'default', text: 'x', created: 1, modified: 1 });
      };
      r.onsuccess = () => {
        r.result.close();
        resolve();
      };
      r.onerror = () => reject(r.error);
    });
    const archive = await CommArchive.open(() => openWebcockpitDb(factory), { now: () => NOW });
    expect(archive.db.version).toBe(DB_VERSION);
    await archive.append(msg('Rasta', NOW, 'hi'));
    expect((await archive.loadRecent('Rasta')).map((r) => r.text)).toEqual(['hi']);
    const tx = archive.db.transaction('profiles', 'readonly');
    const p = await new Promise((res) => {
      const r = tx.objectStore('profiles').get('default');
      r.onsuccess = () => res(r.result);
    });
    expect(p).toMatchObject({ text: 'x' });
    archive.db.close();
  });

  it('lazyDb opens once and reopens after the connection was closed for an upgrade', async () => {
    const factory = new IDBFactory();
    const openDb = lazyDb(factory);
    const a = await openDb();
    expect(await openDb()).toBe(a);
    a.onversionchange!(new Event('versionchange') as IDBVersionChangeEvent);
    const b = await openDb();
    expect(b).not.toBe(a);
    b.close();
  });
});
