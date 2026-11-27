// Stage 80 part D (ADR 0172): the sync kinds `lookImage` and `looks`. Their
// specs (bodies, policy, gzip), the adapters on IndexedDB (src/cloud/space/
// local.ts), Create account's copy of the looks, a pulled change taken in
// at once by the page's caches (notify.ts → `noteSynced` → the looks store
// and the own images), and the engine over both kinds on two devices,
// with the server model's own-image budget. IndexedDB is fake-indexeddb.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS, SYNC_KINDS, SYNC_KINDS_OPEN } from '../../shared/cloud/api.ts';
import { deriveKeys, makeRoot } from '../../src/cloud/crypto';
import { parseConfig } from '../../src/cloud/config';
import { parseAccount } from '../../src/cloud/account/api';
import { type OpenDb, idbLocalItems, idbSyncRecords } from '../../src/cloud/space/local';
import { applyWritten } from '../../src/cloud/space/notify';
import { LOCKING_SPECS, prepareAccountSpace, resetSpaceConnsForTests } from '../../src/cloud/space/spaces';
import { SMALL_KIND_WORDS, unsyncedKindsWords } from '../../src/cloud/space/unsynced-words';
import { SyncEngine } from '../../src/cloud/sync/engine';
import { ITEM_SPECS, SYNC_SPECS, decodeBody, encodeBody, gunzip, lookImageSpec, looksSpec } from '../../src/cloud/sync/items';
import type { SyncKeys } from '../../src/cloud/sync/types';
import { STORE, idbDone, idbRequest, openDeviceDb, openWebcockpitDb } from '../../src/core/db';
import { resetSpaceForTests } from '../../src/core/space';
import { onStored } from '../../src/core/store-events';
import { OwnImages, fromBase64, imageMime, newImageId, toBase64 } from '../../src/looks/images';
import { LooksStore } from '../../src/looks/store';
import { RemoteError, type Remote, type WriteResult } from '../../src/cloud/sync/types';
import { ServerModel } from './cloud-sync-model';

const enc = new TextEncoder();
const j = (x: unknown): Uint8Array => enc.encode(JSON.stringify(x));
const NOW = Date.UTC(2026, 10, 27, 2);
const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const WEBP = toBase64(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 9, 9, 9]));
const image = (id = ID, created = NOW, label = 'Rasta'): Record<string, unknown> => ({ id, label, webp: WEBP, created });

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let keys: SyncKeys;
beforeEach(async () => {
  vi.stubGlobal('localStorage', memStorage());
  vi.stubGlobal('sessionStorage', memStorage());
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  resetSpaceForTests();
  resetSpaceConnsForTests();
  keys ??= await deriveKeys(makeRoot());
});

async function put(db: IDBDatabase, store: string, ...recs: [unknown, IDBValidKey?][]): Promise<void> {
  const t = db.transaction(store, 'readwrite');
  const done = idbDone(t);
  for (const [r, k] of recs) t.objectStore(store).put(r, k);
  await done;
}
async function get(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
  const t = db.transaction(store, 'readonly');
  const done = idbDone(t);
  const r = await idbRequest(t.objectStore(store).get(key));
  await done;
  return r;
}
function deviceSpace(factory: IDBFactory, name = 'webcockpit-u-ole'): OpenDb {
  let p: Promise<IDBDatabase> | null = null;
  return () => (p ??= openWebcockpitDb(factory, name, { create: true }));
}

describe('the kinds lists (N1)', () => {
  it('both kinds are known and open on the server, synced by the client in the order lookImage, looks (last)', () => {
    expect(SYNC_KINDS).toEqual(expect.arrayContaining(['lookImage', 'looks']));
    expect(SYNC_KINDS_OPEN).toEqual(expect.arrayContaining(['lookImage', 'looks']));
    expect(SYNC_SPECS.map((s) => s.kind).slice(-2)).toEqual(['lookImage', 'looks']);
    expect(ITEM_SPECS.lookImage).toBe(lookImageSpec);
    expect(ITEM_SPECS.looks).toBe(looksSpec);
    // A copy not in the account keeps both (Log out's list), and they have words.
    expect(LOCKING_SPECS.map((s) => s.kind)).toEqual(expect.arrayContaining(['lookImage', 'looks']));
    expect(SMALL_KIND_WORDS).toEqual(expect.arrayContaining([['looks', 'looks'], ['lookImage', 'own images']]));
    expect(
      unsyncedKindsWords([
        { kind: 'lookImage', key: ID, name: null, change: 'new' },
        { kind: 'looks', key: 'looks', name: null, change: 'edit' },
      ]),
    ).toBe('looks · own images');
  });

  it('the limits: own images in the defaults, read from the config and the account (defaults from an older Worker)', () => {
    expect(DEFAULT_ACCOUNT_LIMITS).toMatchObject({ lookImages: 50, lookImageMaxBytes: 32_768, lookBytes: 1_638_400 });
    const base = { items: 1, itemBytes: 2, itemMaxBytes: 3, runBytes: 4, runMaxBytes: 5, payloadMaxBytes: 6, sharedRuns: 7 };
    expect(parseConfig({ flags: {}, limits: { ...base, lookImages: 9, lookImageMaxBytes: 10, lookBytes: 11 } }).limits).toMatchObject({ lookImages: 9, lookImageMaxBytes: 10, lookBytes: 11 });
    expect(parseConfig({ flags: {}, limits: base }).limits).not.toHaveProperty('lookImages');
    const acc = (usage: unknown, limits: unknown) =>
      parseAccount({ name: 'ole', created: 1, state: 'active', usage, limits, sessions: [], prefs: { rulesAccepted: false } });
    expect(acc({ items: 0, itemBytes: 0, runBytes: 0, lookImages: 2, lookBytes: 300 }, { ...base, lookImages: 9, lookImageMaxBytes: 10, lookBytes: 11 })).toMatchObject({
      usage: { lookImages: 2, lookBytes: 300 },
      limits: { lookImages: 9, lookImageMaxBytes: 10, lookBytes: 11 },
    });
    const old = acc({ items: 0, itemBytes: 0, runBytes: 0 }, base);
    expect(old?.usage).toEqual({ items: 0, itemBytes: 0, runBytes: 0 });
    expect(old?.limits).toMatchObject({ lookImages: 50, lookImageMaxBytes: 32_768, lookBytes: 1_638_400 });
  });
});

describe('the specs', () => {
  it('lookImage: keyed by its random id, last writer, gzipped; a bad body is unreadable, a newer v newer', async () => {
    expect(lookImageSpec).toMatchObject({ kind: 'lookImage', version: 1, policy: 'lastWriter', compress: true });
    expect(lookImageSpec.names).toBeUndefined();
    expect(lookImageSpec.key(image())).toBe(ID);
    const plain = await encodeBody(lookImageSpec, image());
    // The plaintext is gzip of the canonical JSON.
    expect(JSON.parse(new TextDecoder().decode(await gunzip(plain)))).toEqual({ ...image(), v: 1 });
    expect(await decodeBody(lookImageSpec, plain)).toEqual({ ok: true, body: image() });
    const gz = async (x: unknown) => decodeBody(lookImageSpec, await encodeBody({ ...lookImageSpec, version: 1 }, x as Record<string, unknown>));
    for (const bad of [{ id: 'short' }, { webp: 'not base64!' }, { webp: '' }, { webp: 'abc' }, { label: 'x'.repeat(61) }, { created: 'now' }, { webp: 'A'.repeat(70_000) }]) {
      expect(await gz({ ...image(), ...bad }), JSON.stringify(bad).slice(0, 40)).toEqual({ ok: false, why: 'unreadable' });
    }
    expect(await decodeBody(lookImageSpec, j({ ...image(), v: 2 }))).toEqual({ ok: false, why: 'unreadable' }); // not gzip
    const newer = await encodeBody({ ...lookImageSpec, version: 2 }, image());
    expect(await decodeBody(lookImageSpec, newer)).toEqual({ ok: false, why: 'newer' });
  });

  it('looks: one item (key `looks`), merged per name by the newest `at`; bad entries are dropped', async () => {
    expect(looksSpec).toMatchObject({ kind: 'looks', version: 1, policy: 'merge' });
    expect(looksSpec.compress).toBeUndefined();
    const body = { names: { rasta: { look: { src: 'own', id: ID }, at: 5, own: true }, gibur: { look: { src: 'lib', id: 'elf-f-noldor' }, at: 3 } } };
    expect(looksSpec.key(body)).toBe('looks');
    expect(await decodeBody(looksSpec, await encodeBody(looksSpec, body))).toEqual({ ok: true, body });
    expect(await decodeBody(looksSpec, j({ v: 1, names: { Rasta: { look: { src: 'auto' }, at: 1 }, bad: { look: { src: 'x' }, at: 1 }, worse: 7 } }))).toEqual({
      ok: true,
      body: { names: { rasta: { look: { src: 'auto' }, at: 1 } } },
    });
    expect(await decodeBody(looksSpec, j({ v: 1 }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(looksSpec, j({ v: 2, names: {} }))).toEqual({ ok: false, why: 'newer' });
    const local = { names: { rasta: { look: { src: 'auto' }, at: 9, own: true }, gibur: { look: { src: 'lib', id: 'a' }, at: 1 } } };
    const remote = { names: { rasta: { look: { src: 'own', id: ID }, at: 5 }, gibur: { look: { src: 'lib', id: 'b' }, at: 2 }, frodo: { look: { src: 'auto' }, at: 1 } } };
    // A reset to automatic is an entry: the newer one wins over an older choice; `own` sticks.
    expect(looksSpec.merge!(local, remote)).toEqual({
      names: { rasta: { look: { src: 'auto' }, at: 9, own: true }, gibur: { look: { src: 'lib', id: 'b' }, at: 2 }, frodo: { look: { src: 'auto' }, at: 1 } },
    });
  });
});

describe('the adapters', () => {
  it('lookImage: one row per image, put and remove; a bad row is no item', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    const written = vi.fn();
    const lw = idbLocalItems(open, { written }, { type: 'desktop' });
    await lw.write('lookImage', { put: [image()], remove: [] });
    expect(written).toHaveBeenCalledWith('lookImage', undefined, undefined);
    await put(await open(), STORE.lookImages, [{ id: 'bad', webp: 1 }]);
    expect(await li.list('lookImage')).toEqual([{ key: ID, body: image() }]);
    await li.write('lookImage', { put: [], remove: [ID] });
    expect(await li.list('lookImage')).toEqual([]);
  });

  it('looks: none until a name is chosen; a put is merged into what is stored (a choice made since stays); a remove deletes', async () => {
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x' });
    const li = idbLocalItems(open, {}, { type: 'desktop' });
    expect(await li.list('looks')).toEqual([]);
    await put(await open(), STORE.looks, [{ names: {} }, 'looks']);
    expect(await li.list('looks')).toEqual([]);
    await put(await open(), STORE.looks, [{ names: { rasta: { look: { src: 'lib', id: 'a' }, at: 10, own: true } } }, 'looks']);
    expect(await li.list('looks')).toEqual([{ key: 'looks', body: { names: { rasta: { look: { src: 'lib', id: 'a' }, at: 10, own: true } } } }]);
    await li.write('looks', { put: [{ names: { rasta: { look: { src: 'auto' }, at: 5 }, gibur: { look: { src: 'lib', id: 'b' }, at: 6 } } }], remove: [] });
    expect(await get(await open(), STORE.looks, 'looks')).toEqual({
      names: { rasta: { look: { src: 'lib', id: 'a' }, at: 10, own: true }, gibur: { look: { src: 'lib', id: 'b' }, at: 6 } },
    });
    await li.write('looks', { put: [], remove: ['looks'] });
    expect(await li.list('looks')).toEqual([]);
  });

  it('Create account moves the device’s looks in (the device keeps its own); a login does not; no own images are copied', async () => {
    const dev = await openDeviceDb();
    const doc = { names: { rasta: { look: { src: 'lib', id: 'elf-f-noldor' }, at: 4, own: true } } };
    await put(dev, STORE.looks, [doc, 'looks']);
    const open = await prepareAccountSpace('ole', { fresh: true, deviceLabel: 'x', copy: 'all' });
    expect(await get(await open(), STORE.looks, 'looks')).toEqual(doc);
    expect(await get(dev, STORE.looks, 'looks')).toEqual(doc);
    const login = await prepareAccountSpace('anna', { fresh: true, deviceLabel: 'x' });
    expect(await get(await login(), STORE.looks, 'looks')).toBeUndefined();
    dev.close();
  });
});

describe('a pulled change is taken in at once', () => {
  it('looks: the store reads the record again (also during play); the own images too', async () => {
    const open = deviceSpace(new IDBFactory());
    const images = new OwnImages({ openDb: open, enabled: true, now: () => NOW });
    const looks = new LooksStore({ openDb: open, now: () => NOW, images });
    await looks.ready;
    await images.ready;
    const seen = vi.fn();
    looks.subscribe(seen);
    // The sync writes both stores behind the page's back, then tells it.
    await put(await open(), STORE.looks, [{ names: { rasta: { look: { src: 'own', id: ID }, at: NOW } } }, 'looks']);
    await put(await open(), STORE.lookImages, [image()]);
    await applyWritten({ profiles: {} as never, settings: {} as never }, { kind: 'lookImage' });
    await applyWritten({ profiles: {} as never, settings: {} as never }, { kind: 'looks' });
    await vi.waitFor(() => expect(looks.stored('Rasta')).toEqual({ src: 'own', id: ID }));
    await vi.waitFor(() => expect(looks.ownIds()).toEqual(new Set([ID])));
    expect(looks.ownSrc(ID)).toBe(`data:image/webp;base64,${WEBP}`);
    expect(seen).toHaveBeenCalled();
    looks.dispose();
    images.dispose();
  });

  it('a save merges into what is stored: a pull the store has not read yet is never overwritten', async () => {
    const open = deviceSpace(new IDBFactory());
    const looks = new LooksStore({ openDb: open, now: () => NOW });
    await looks.ready;
    await put(await open(), STORE.looks, [{ names: { gibur: { look: { src: 'lib', id: 'b' }, at: NOW - 5 } } }, 'looks']);
    const stored: string[] = [];
    const off = onStored((k) => stored.push(k));
    looks.choose('Rasta', { src: 'lib', id: 'a' }, true);
    await vi.waitFor(() => expect(stored).toEqual(['looks']));
    off();
    expect(await get(await open(), STORE.looks, 'looks')).toEqual({
      names: { gibur: { look: { src: 'lib', id: 'b' }, at: NOW - 5 }, rasta: { look: { src: 'lib', id: 'a' }, at: NOW, own: true } },
    });
    expect(looks.stored('gibur')).toEqual({ src: 'lib', id: 'b' });
  });
});

describe('the own images (src/looks/images.ts)', () => {
  it('off in the device’s space: nothing is listed or shown, an add is refused', async () => {
    const open = deviceSpace(new IDBFactory(), 'webcockpit');
    await put(await open(), STORE.lookImages, [image()]);
    const images = new OwnImages({ openDb: open, enabled: false });
    await images.ready;
    expect(images.ids()).toBeNull();
    expect(images.list()).toEqual([]);
    expect(images.src(ID)).toBeNull();
    await expect(images.add(new Uint8Array([1]), 'x')).rejects.toThrow();
    const looks = new LooksStore({ openDb: open, images });
    expect(looks.ownIds()).toBeNull();
  });

  it('add, src, bytes and remove; removing an image in use puts its characters back on automatic', async () => {
    const open = deviceSpace(new IDBFactory());
    const images = new OwnImages({ openDb: open, enabled: true, now: () => NOW });
    const looks = new LooksStore({ openDb: open, now: () => NOW, images });
    await images.ready;
    const stored: string[] = [];
    const off = onStored((k) => stored.push(k));
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const img = await images.add(bytes, 'My dwarf');
    expect(img.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(stored).toContain('lookImage');
    expect(images.src(img.id)).toMatch(/^data:image\/jpeg;base64,/);
    expect(new Uint8Array(images.bytes(img.id)!)).toEqual(bytes);
    expect(await get(await open(), STORE.lookImages, img.id)).toEqual({ id: img.id, label: 'My dwarf', webp: toBase64(bytes), created: NOW });
    looks.choose('Rasta', { src: 'own', id: img.id }, true);
    looks.choose('Gibur', { src: 'own', id: img.id });
    looks.choose('Frodo', { src: 'lib', id: 'x' });
    expect(looks.usersOf(img.id)).toEqual(['gibur', 'rasta']);
    await looks.removeImage(img.id);
    expect(images.ids()).toEqual(new Set());
    expect(looks.stored('rasta')).toEqual({ src: 'auto' });
    expect(looks.stored('gibur')).toEqual({ src: 'auto' });
    expect(looks.stored('frodo')).toEqual({ src: 'lib', id: 'x' });
    expect(looks.get().names.rasta?.own).toBe(true);
    expect(await get(await open(), STORE.lookImages, img.id)).toBeUndefined();
    off();
  });

  it('ids, base64 and the type from the bytes', () => {
    expect(newImageId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newImageId()).not.toBe(newImageId());
    const b = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) & 255);
    expect(fromBase64(toBase64(b))).toEqual(b);
    expect(imageMime(toBase64(Uint8Array.from([0x52, 0x49, 0x46, 0x46])))).toBe('image/webp');
    expect(imageMime('/9j/4AAQ')).toBe('image/jpeg');
    expect(imageMime('iVBORw0KGgoAAA')).toBe('image/png');
  });
});

describe('the engine over both kinds on two devices', () => {
  /** A Remote straight onto the server model (as tests/unit/cloud-sync-model.ts `remoteFor`, without a link). */
  function remote(server: ServerModel): Remote {
    const w = (a: { status: number; body: unknown }): WriteResult => {
      if (a.status === 200) return { status: 'ok', written: a.body as never };
      if (a.status === 409) return { status: 'conflict', current: (a.body as { current: never }).current };
      if (a.status === 413) return { status: 'full', error: (a.body as { error: never }).error };
      throw new RemoteError('refused', { status: a.status });
    };
    return {
      changes: async (since, limit) => server.changes(since, limit ?? 500).body as never,
      put: async (kind, id, base, blob) => w(server.put(kind, id, base, blob)),
      remove: async (kind, id, base) => w(server.remove(kind, id, base)),
    };
  }

  it('an image and the looks that name it go across; the 51st image is refused (too_many_items) and kept on the device', async () => {
    const server = new ServerModel();
    const aOpen = deviceSpace(new IDBFactory());
    const bOpen = deviceSpace(new IDBFactory());
    const engine = (open: OpenDb, events: { emit: (e: unknown) => void } = { emit: () => {} }): SyncEngine =>
      new SyncEngine({
        local: idbLocalItems(open, {}, { type: 'desktop', now: () => NOW }),
        records: idbSyncRecords(open, () => 'd'),
        remote: remote(server),
        keys,
        specs: SYNC_SPECS,
        events: events as never,
        yieldToGame: async () => {},
      });
    await put(await aOpen(), STORE.lookImages, [image()]);
    await put(await aOpen(), STORE.looks, [{ names: { rasta: { look: { src: 'own', id: ID }, at: NOW, own: true } } }, 'looks']);
    await put(await bOpen(), STORE.looks, [{ names: { gibur: { look: { src: 'lib', id: 'b' }, at: NOW - 1 } } }, 'looks']);
    const a = engine(aOpen);
    const b = engine(bOpen);
    for (const e of [a, b, a, b]) expect(await e.sync()).toEqual({ type: 'synced' });
    expect(await get(await bOpen(), STORE.lookImages, ID)).toEqual(image());
    const both = { names: { gibur: { look: { src: 'lib', id: 'b' }, at: NOW - 1 }, rasta: { look: { src: 'own', id: ID }, at: NOW, own: true } } };
    expect(await get(await bOpen(), STORE.looks, 'looks')).toEqual(both);
    expect(await get(await aOpen(), STORE.looks, 'looks')).toEqual(both);
    // The images count apart from the small items.
    expect(server.usage()).toEqual({ items: 1, itemBytes: expect.any(Number) });
    expect(server.lookUsage()).toMatchObject({ lookImages: 1 });

    // 50 on the shelf, and a 51st: the server refuses it, the device keeps it and says why.
    const more: [unknown][] = [];
    for (let i = 0; i < 50; i++) more.push([image(`${String(i).padStart(2, '0')}cdefghijklmnopqrstuv`, NOW + i)]);
    await put(await aOpen(), STORE.lookImages, ...more);
    const events: { type: string; kind?: string; error?: string }[] = [];
    const a2 = engine(aOpen, { emit: (e) => events.push(e as never) });
    await a2.sync();
    expect(server.lookUsage().lookImages).toBe(50);
    expect(events.filter((e) => e.type === 'full')).toEqual([expect.objectContaining({ kind: 'lookImage', error: 'too_many_items' })]);
    expect(a2.status.get().state).toBe('full');
    const refused = await new OwnImages({ openDb: aOpen, enabled: true }).refused();
    expect([...refused.values()]).toEqual(['too_many_items']);
    expect((await idbLocalItems(aOpen, {}, { type: 'desktop' }).list('lookImage')).length).toBe(51);
  });
});
