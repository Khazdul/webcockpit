import { IDBFactory } from 'fake-indexeddb';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { STORE, type StoredMap, idbRequest } from '../../src/core/db';
import { assetResolver, EMPTY_PNG } from '../../src/map/assets';
import { writeMm2 } from '../../src/map/mm2-write';
import { BUNDLED_MAP_FILE, MapStore } from '../../src/map/store';
import { runMapToolRequest } from '../../src/map/tools';
import { lazyDb } from '../../src/panes/context';
import { gridMap } from './map-grid';

const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));
const deflate = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateSync(b));

/** The real check, inline (no worker in Node). */
async function validate(bytes: ArrayBuffer) {
  const r = await runMapToolRequest({ t: 'validate', bytes }, { fetch, inflate });
  if (!r.ok) throw new Error(r.message);
  if (r.t !== 'validate') throw new Error('bad answer');
  return r.info;
}

describe('MapStore', () => {
  it('uses the bundled map until an import, then the stored bytes; back to bundled', async () => {
    const factory = new IDBFactory();
    const store = new MapStore({ openDb: lazyDb(factory), validate, now: () => 1_790_000_000_000, base: '/x/map/' });
    expect(await store.current()).toEqual({ kind: 'bundled', name: BUNDLED_MAP_FILE });
    expect(await store.source()).toEqual({ kind: 'url', url: `/x/map/${BUNDLED_MAP_FILE}`, name: BUNDLED_MAP_FILE });
    const host = store.host();
    expect(host.assets).toEqual({ kind: 'base', url: '/x/map/' });
    const changed = vi.fn();
    const unsub = host.subscribe!(changed);

    const bytes = await writeMm2(gridMap(6, 5), deflate);
    const rec = await store.importFile('small.mm2', bytes.slice().buffer);
    expect(rec).toMatchObject({ key: 'current', name: 'small.mm2', size: bytes.byteLength, rooms: 30, date: 1_790_000_000_000 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await store.current()).toMatchObject({ kind: 'imported', name: 'small.mm2', rooms: 30, size: bytes.byteLength });

    // Each source is a fresh copy (the pane transfers it).
    const a = await host.source();
    const b = await host.source();
    expect(a?.kind).toBe('bytes');
    if (a?.kind !== 'bytes' || b?.kind !== 'bytes') return;
    expect(a.bytes).not.toBe(b.bytes);
    expect(new Uint8Array(a.bytes)).toEqual(bytes);

    // Persisted: a new store over the same database finds it.
    const again = new MapStore({ openDb: lazyDb(factory), validate });
    expect(await again.current()).toMatchObject({ kind: 'imported', name: 'small.mm2' });

    // A bad file throws and keeps the imported map.
    await expect(store.importFile('junk.mm2', new Uint8Array([1, 2, 3, 4]).buffer)).rejects.toThrow(/Not an MMapper map/);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await store.current()).toMatchObject({ name: 'small.mm2' });

    await store.useBundled();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(await store.current()).toEqual({ kind: 'bundled', name: BUNDLED_MAP_FILE });
    const db = await lazyDb(factory)();
    expect(await idbRequest<StoredMap | undefined>(db.transaction(STORE.maps).objectStore(STORE.maps).get('current'))).toBeUndefined();
    unsub();
  });

  it('falls back to the bundled map without IndexedDB; an import then fails', async () => {
    const store = new MapStore({ openDb: lazyDb(null), validate });
    expect((await store.current()).kind).toBe('bundled');
    const bytes = await writeMm2(gridMap(2, 2), deflate);
    await expect(store.importFile('a.mm2', bytes.slice().buffer)).rejects.toThrow(/no IndexedDB/);
    expect((await store.current()).kind).toBe('bundled');
  });
});

describe('inline asset fallback', () => {
  it('answers a missing tile with the fallback, but not a missing font', async () => {
    const f = vi.fn(async (u: string) => new Response(u));
    const r = assetResolver({ kind: 'inline', files: { 'pixmaps/a.png': 'data:image/png;base64,eA==' }, fallback: EMPTY_PNG }, f as never);
    expect(await (await r('pixmaps/a.png')).text()).toBe('x');
    const empty = await r('pixmaps/missing.png');
    expect([empty.type, empty.size]).toEqual(['image/png', 70]);
    // Decoded, never fetched: the shared replay's frame has connect-src 'none' (ADR 0154).
    expect(f).not.toHaveBeenCalled();
    await expect(r('fonts/Cantarell18.fnt')).rejects.toThrow(/not included/);
    const strict = assetResolver({ kind: 'inline', files: {} }, f as never);
    await expect(strict('pixmaps/missing.png')).rejects.toThrow(/not included/);
  });
});
