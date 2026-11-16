// The community's freshness (stage 65, owner's feedback 4, ADR 0155 "As
// built (stage 65, owner's feedback: W4, freshness)"): the public reads are
// never kept by the browser (`no-cache`), the Cache API keeps them 60 s at
// most by their own stored time (a cache that keeps an entry longer is not
// believed), and a write that changes what they show (a note, a listing, a
// removal) makes the next read in this place fresh at once. Review fix 2:
// only a write that changes a public read moves the mark, at most every
// MARK_EVERY_MS, after the answer; the mark is kept in memory a moment.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CommunityBoxes, GalleryPage, RunesBoard } from '../../shared/cloud/api.ts';
import { handle } from '../router.ts';
import { type CacheLike, PUBLIC_CHANGE_HEADER } from '../runtime.ts';
import { at, emptyTables } from './helpers.ts';
import { META, ORIGIN, call, payload, publish, reportOf, setLimits, signUp, siteverify } from './share-helpers.ts';
import { CENV, NOW, ccall, comment, commented, list, note, noted, ok, vote } from './community-helpers.ts';
import { MARK_EVERY_MS } from '../community.ts';
import { adminCall } from './admin-call.ts';

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
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 1500))).notes.map((n) => n.text)).toEqual(['From alice.']);
    // (Marks come at most every MARK_EVERY_MS: these writes are that far apart.)
    const id = await noted(bob, 'From bob.', { cache, now: NOW + 7000 });
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 7500))).notes.map((n) => n.text)).toEqual(['From bob.', 'From alice.']);
    expect((await ccall('DELETE', `/api/u/runes/${id}`, undefined, { cookie: bob, cache, now: NOW + 13_000 })).status).toBe(204);
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 13_500))).notes.map((n) => n.text)).toEqual(['From alice.']);
  });

  it('a listing: the list and the boxes show it at once; a refused write marks nothing; the header stays inside', async () => {
    const cache = forever();
    const alice = await signUp('alice');
    expect((await ok<GalleryPage>(await read('/api/gallery', cache))).rows).toEqual([]);
    expect((await ok<CommunityBoxes>(await read('/api/community', cache))).hallOfFame).toEqual([]);
    // A link-only run (not through the cache): the lists do not show it.
    const id = await publish(alice, payload(100, 1), { ...META, listed: false }, { env: CENV, now: NOW });
    expect((await ok<GalleryPage>(await read('/api/gallery', cache, NOW + 1000))).rows).toEqual([]);
    const marked = await ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice, cache, now: NOW + 1000 });
    expect(marked.status).toBe(200);
    expect(marked.headers.get('x-wc-public-change')).toBeNull();
    expect((await ok<GalleryPage>(await read('/api/gallery', cache, NOW + 2000))).rows.map((r) => r.id)).toEqual([id]);
    expect((await ok<GalleryPage>(await read('/api/gallery?sort=top', cache, NOW + 2000))).rows.map((r) => r.id)).toEqual([id]);
    const keys = cache.store.size;
    // A refused write (400) leaves the kept answers as they are.
    expect((await note(alice, '', { cache, now: NOW + 9000 })).status).toBe(400);
    await read('/api/gallery', cache, NOW + 9000);
    expect(cache.store.size).toBe(keys);
  });
});

/** The marks a cache was given (review fix 2: only a public change makes one). */
const marks = (cache: { store: Map<string, Response> }): number => [...cache.store.keys()].filter((k) => k.endsWith('/api/community/~mark')).length;

/** A cache that counts its puts of the mark and its lookups. */
function counted(): CacheLike & { store: Map<string, Response>; markPuts: number; matches: number } {
  const inner = forever();
  const c = {
    store: inner.store,
    markPuts: 0,
    matches: 0,
    async match(r: Request) {
      c.matches++;
      return inner.match(r);
    },
    async put(r: Request, res: Response) {
      if (r.url.endsWith('/~mark')) c.markPuts++;
      return inner.put(r, res);
    },
  };
  return c;
}

describe('the mark (review fix 2: R2-2, CR4, CR5)', () => {
  it('moves only when the write changes what the public reads show', async () => {
    const cache = counted();
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const listed = await list(alice, { now: NOW - 60_000 });
    const linkOnly = await publish(alice, payload(100, 2), { ...META, listed: false }, { env: CENV, now: NOW - 60_000 });
    const quiet = (o: { now: number }): { cache: CacheLike; now: number } => ({ cache, now: o.now });
    let t = NOW;
    const step = (): { cache: CacheLike; now: number } => quiet({ now: (t += 10_000) });
    // None of these changes a public read.
    expect((await vote(bob, linkOnly, 4, { cookie: bob, ...step() })).status).toBe(200);
    expect((await ccall('DELETE', `/api/u/pub/${listed}/vote`, undefined, { cookie: bob, ...step() })).status).toBe(200);
    expect((await comment(bob, linkOnly, 'Nice.', step())).status).toBe(200);
    expect((await reportOf(bob, listed, {}, { env: CENV, ...step() })).status).toBe(204);
    expect((await ccall('PATCH', `/api/u/pub/${linkOnly}`, { title: 'Still link only' }, { cookie: alice, ...step() })).status).toBe(200);
    expect((await ccall('PATCH', `/api/u/pub/${listed}`, { listed: true }, { cookie: alice, ...step() })).status).toBe(200);
    expect((await call('POST', '/api/u/pub', undefined, { env: CENV, cookie: alice })).status).not.toBe(200);
    expect(cache.markPuts).toBe(0);
    // A vote on a listed run: one mark; the same vote again: none.
    expect((await vote(bob, listed, 4, { cookie: bob, ...step() })).status).toBe(200);
    expect(cache.markPuts).toBe(1);
    expect((await vote(bob, listed, 4, { cookie: bob, ...step() })).status).toBe(200);
    expect(cache.markPuts).toBe(1);
    // A comment on it, a note, a title change of the listed run, unlisting, listing again, removal: one each.
    await commented(bob, listed, 'Nice.', step());
    await noted(bob, 'Orcs.', step());
    expect((await ccall('PATCH', `/api/u/pub/${listed}`, { title: 'New words' }, { cookie: alice, ...step() })).status).toBe(200);
    expect((await ccall('PATCH', `/api/u/pub/${listed}`, { listed: false }, { cookie: alice, ...step() })).status).toBe(200);
    expect((await ccall('PATCH', `/api/u/pub/${listed}`, { listed: true }, { cookie: alice, ...step() })).status).toBe(200);
    expect((await ccall('DELETE', `/api/u/pub/${listed}`, undefined, { cookie: alice, ...step() })).status).toBe(204);
    expect(cache.markPuts).toBe(7);
    // Removing the link-only run: none.
    expect((await ccall('DELETE', `/api/u/pub/${linkOnly}`, undefined, { cookie: alice, ...step() })).status).toBe(204);
    expect(cache.markPuts).toBe(7);
    expect(marks(cache)).toBe(1);
  });

  it('at most once per MARK_EVERY_MS; a change inside it gets one later mark when the time is up', async () => {
    const cache = counted();
    const alice = await signUp('alice');
    await setLimits('alice', { notesPerDay: 100 });
    const work: Promise<unknown>[] = [];
    const waits: number[] = [];
    const wakes: (() => void)[] = [];
    const sleep = (ms: number): Promise<void> => {
      waits.push(ms);
      return new Promise((resolve) => wakes.push(resolve));
    };
    const o = (now: number) => ({ cache, now, waitUntil: (p: Promise<unknown>) => void work.push(p), sleep });
    expect((await ok<RunesBoard>(await read('/api/runes', cache))).notes).toEqual([]);
    await noted(alice, 'One.', o(NOW + 1000));
    expect(cache.markPuts).toBe(1);
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 1500))).notes.map((n) => n.text)).toEqual(['One.']);
    // Inside the 5 s: no mark yet (the read is kept from before), one waits for the rest of it.
    await noted(alice, 'Two.', o(NOW + 2000));
    await noted(alice, 'Three.', o(NOW + 3000));
    expect(waits).toEqual([MARK_EVERY_MS - 1000]);
    expect(cache.markPuts).toBe(1);
    for (const wake of wakes) wake();
    await Promise.all(work);
    expect(cache.markPuts).toBe(2);
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 6100))).notes.map((n) => n.text)).toEqual(['Three.', 'Two.', 'One.']);
  });

  it('a run listed or removed is marked at once, even inside the 5 s (bounded by the day’s listings)', async () => {
    const cache = counted();
    const alice = await signUp('alice');
    const o = { cache, sleep: () => new Promise<void>(() => {}) };
    await noted(alice, 'One.', { ...o, now: NOW });
    const id = await publish(alice, payload(100, 4), { ...META, listed: true }, { env: CENV, ...o, now: NOW + 1000 });
    expect(cache.markPuts).toBe(2);
    expect((await ok<GalleryPage>(await read('/api/gallery', cache, NOW + 1500))).rows.map((r) => r.id)).toEqual([id]);
    expect((await ccall('DELETE', `/api/u/pub/${id}`, undefined, { cookie: alice, ...o, now: NOW + 2000 })).status).toBe(204);
    expect(cache.markPuts).toBe(3);
    expect((await ok<GalleryPage>(await read('/api/gallery', cache, NOW + 2500))).rows).toEqual([]);
  });

  it('a change inside the 5 s whose timer never runs gets its mark from the first read after them', async () => {
    const cache = counted();
    const alice = await signUp('alice');
    await setLimits('alice', { notesPerDay: 100 });
    const o = (now: number) => ({ cache, now, sleep: () => new Promise<void>(() => {}) });
    await noted(alice, 'One.', o(NOW));
    await noted(alice, 'Two.', o(NOW + 1000));
    expect(cache.markPuts).toBe(1);
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 1500))).notes.map((n) => n.text)).toEqual(['Two.', 'One.']);
    // (That read was a miss after the first mark; kept from here on until the next.)
    await noted(alice, 'Three.', o(NOW + 2000));
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 4000))).notes).toHaveLength(2);
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 5000))).notes.map((n) => n.text)).toEqual(['Three.', 'Two.', 'One.']);
    expect(cache.markPuts).toBe(2);
  });

  it('the answer does not wait for the put; a hit costs one cache lookup', async () => {
    const alice = await signUp('alice');
    const store = new Map<string, Response>();
    let matches = 0;
    const cache: CacheLike = {
      async match(r) {
        matches++;
        return store.get(r.url)?.clone();
      },
      // A put of the mark that never ends.
      put(r, res) {
        if (r.url.endsWith('/~mark')) return new Promise(() => {});
        store.set(r.url, res);
        return Promise.resolve();
      },
    };
    const timeout = new Promise<'waited'>((resolve) => setTimeout(() => resolve('waited'), 2000));
    const res = await Promise.race([note(alice, 'Orcs.', { cache, now: NOW }), timeout]);
    expect(res).not.toBe('waited');
    expect((res as Response).status).toBe(200);
    // The writer's place knows the mark at once (from memory), so the first read is a miss with the note.
    expect((await ok<RunesBoard>(await read('/api/runes', cache, NOW + 100))).notes.map((n) => n.text)).toEqual(['Orcs.']);
    matches = 0;
    await read('/api/runes', cache, NOW + 200);
    expect(matches).toBe(1);
  });
});

describe("the admin's actions say whether they change a public read", () => {
  it('hide, restore, delete and the account actions do; dismiss does not', async () => {
    const alice = await signUp('alice');
    await signUp('bob');
    const id = await list(alice, { now: NOW - 60_000 });
    const flagged = async (path: string, body: unknown): Promise<string | null> => {
      const res = await adminCall(path, body);
      expect(res.status, path).toBe(204);
      return res.headers.get(PUBLIC_CHANGE_HEADER);
    };
    expect(await flagged(`/api/admin/pub/${id}`, { action: 'dismiss' })).toBeNull();
    expect(await flagged(`/api/admin/pub/${id}`, { action: 'hide' })).toBe('now');
    expect(await flagged(`/api/admin/pub/${id}`, { action: 'restore' })).toBe('now');
    expect(await flagged('/api/admin/account/bob', { action: 'suspend' })).toBe('now');
    expect(await flagged('/api/admin/account/bob', { action: 'restore' })).toBe('now');
    expect(await flagged(`/api/admin/pub/${id}`, { action: 'delete' })).toBe('now');
  });
});
