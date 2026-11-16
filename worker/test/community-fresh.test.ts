// The community's freshness (stage 65, owner's feedback 4, ADR 0155 "As
// built (stage 65, owner's feedback: W4, freshness)"): the public reads are
// never kept by the browser (`no-cache`), the Cache API keeps them 60 s at
// most by their own stored time (a cache that keeps an entry longer is not
// believed), and a write that changes what they show (a note, a listing, a
// removal) makes the next read in this place fresh at once.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CommunityBoxes, GalleryPage, RunesBoard } from '../../shared/cloud/api.ts';
import { handle } from '../router.ts';
import type { CacheLike } from '../runtime.ts';
import { at, emptyTables } from './helpers.ts';
import { ORIGIN, setLimits, signUp, siteverify } from './share-helpers.ts';
import { CENV, NOW, ccall, list, note, noted, ok } from './community-helpers.ts';

beforeEach(async () => {
  await emptyTables();
});

/** A Cache API stand-in that never lets an entry go (as a cache that ignores max-age would). */
function forever(): CacheLike & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    store,
    async match(r) {
      return store.get(r.url)?.clone();
    },
    async put(r, res) {
      store.set(r.url, res);
    },
  };
}

const read = (path: string, cache: CacheLike, now = NOW): Promise<Response> =>
  handle(new Request(`${ORIGIN}${path}`, { headers: { 'cf-connecting-ip': '203.0.113.1' } }), CENV, { ...at(now, siteverify), cache });

describe('the public reads and the browser', () => {
  it('answer no-cache to the browser on a miss and on a hit; the Cache API keeps its copy 60 s', async () => {
    const cache = forever();
    for (const path of ['/api/gallery', '/api/community', '/api/runes']) {
      const miss = await read(path, cache);
      expect(miss.status, path).toBe(200);
      expect(miss.headers.get('cache-control'), path).toBe('no-cache');
      const hit = await read(path, cache, NOW + 1000);
      expect(hit.headers.get('cache-control'), path).toBe('no-cache');
      expect(hit.headers.get('x-wc-kept'), path).toBeNull();
    }
    for (const [key, res] of cache.store) {
      expect(res.headers.get('cache-control'), key).toBe('public, max-age=60');
      expect(res.headers.get('x-wc-kept'), key).toBe(String(NOW));
    }
    // Without a cache (the static server, the tests): the same header.
    expect((await ccall('GET', '/api/runes')).headers.get('cache-control')).toBe('no-cache');
  });
});

describe('the edge copy', () => {
  it('is believed 60 s by its stored time, even from a cache that keeps it longer', async () => {
    const cache = forever();
    const alice = await signUp('alice');
    await setLimits('alice', { notesPerDay: 100 });
    expect((await ok<RunesBoard>(await read('/api/runes', cache))).notes).toEqual([]);
    // Written behind the cache's back (another place's write: no mark here).
    await noted(alice, 'Orcs at the ford.');
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 59_000))).notes).toEqual([]);
    const later = await ok<RunesBoard>(await read('/api/runes', cache, NOW + 60_000));
    expect(later.notes.map((n) => n.text)).toEqual(['Orcs at the ford.']);
    expect(later.time).toBe(NOW + 60_000);
  });
});

describe('a write makes the next read fresh in this place', () => {
  it('a note and its removal: the writer (and everybody here) sees the whole board at once', async () => {
    const cache = forever();
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    expect((await ok<RunesBoard>(await read('/api/runes', cache))).notes).toEqual([]);
    await noted(alice, 'From alice.', { cache, now: NOW + 1000 });
    const id = await noted(bob, 'From bob.', { cache, now: NOW + 2000 });
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 3000))).notes.map((n) => n.text)).toEqual(['From bob.', 'From alice.']);
    expect((await ccall('DELETE', `/api/u/runes/${id}`, undefined, { cookie: bob, cache, now: NOW + 4000 })).status).toBe(204);
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 5000))).notes.map((n) => n.text)).toEqual(['From alice.']);
  });

  it('a listing: the list and the boxes show it at once; a refused write marks nothing', async () => {
    const cache = forever();
    const alice = await signUp('alice');
    expect((await ok<GalleryPage>(await read('/api/gallery', cache))).rows).toEqual([]);
    expect((await ok<CommunityBoxes>(await read('/api/community', cache))).hallOfFame).toEqual([]);
    const id = await list(alice, { now: NOW });
    // (`list` does not pass the cache: the mark comes from a write through it.)
    expect((await ok<GalleryPage>(await read('/api/gallery', cache, NOW + 1000))).rows).toEqual([]);
    const marked = await ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice, cache, now: NOW + 1000 });
    expect(marked.status).toBe(200);
    expect((await ok<GalleryPage>(await read('/api/gallery', cache, NOW + 2000))).rows.map((r) => r.id)).toEqual([id]);
    expect((await ok<GalleryPage>(await read('/api/gallery?sort=top', cache, NOW + 2000))).rows.map((r) => r.id)).toEqual([id]);
    const keys = cache.store.size;
    // A refused write (400) leaves the kept answers as they are.
    expect((await note(alice, '', { cache, now: NOW + 3000 })).status).toBe(400);
    await read('/api/gallery', cache, NOW + 3000);
    expect(cache.store.size).toBe(keys);
  });
});
