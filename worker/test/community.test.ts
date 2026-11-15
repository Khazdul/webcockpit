// The community (stage 65, ADR 0155): listing, the list and its cache, the
// Hall of Fame boxes, a random run, the counters, views per address, the
// metas' new fields, and the flags off.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CommunityBoxes, CommunityNews, CommunitySeen, GalleryPage, GalleryRandom, MyPub, PubMeta, PubWritten, PublicStats } from '../../shared/cloud/api.ts';
import { galleryParams } from '../community.ts';
import { handle } from '../router.ts';
import type { CacheLike } from '../runtime.ts';
import { at, count, db, device, emptyTables } from './helpers.ts';
import { META, ORIGIN, call, payload, post, publish, setLimits, signUp, siteverify } from './share-helpers.ts';
import { CENV, DAY, NOW, ageAccount, ccall, cenvOf, list, ok, voted } from './community-helpers.ts';

beforeEach(async () => {
  await emptyTables();
});

const pubOf = async (cookie: string, id: string): Promise<MyPub> => (await ok<{ pubs: MyPub[] }>(await ccall('GET', '/api/u/pub', undefined, { cookie }))).pubs.find((p) => p.id === id)!;
const page = (q: string, o: { now?: number } = {}): Promise<GalleryPage> => ccall('GET', `/api/gallery${q}`, undefined, o).then((r) => ok<GalleryPage>(r));

describe('listing (Hall of Fame)', () => {
  it('POST with listed: true lists the run and sets listedAt; PATCH unlists and lists again keeping it', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    const p = await pubOf(alice, id);
    expect(p.listed).toBe(true);
    expect(p.listedAt).toBe(NOW);
    const off = await ok<PubWritten>(await ccall('PATCH', `/api/u/pub/${id}`, { listed: false }, { cookie: alice, now: NOW + 1000 }));
    expect(off.pub.listed).toBe(false);
    expect(off.pub.listedAt).toBe(NOW);
    const on = await ok<PubWritten>(await ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice, now: NOW + 2 * DAY }));
    expect(on.pub.listed).toBe(true);
    expect(on.pub.listedAt).toBe(NOW);
    // A link-only run listed later gets its first time then.
    const link = await publish(alice, payload(100, 9), META, { env: CENV });
    expect((await pubOf(alice, link)).listedAt).toBeUndefined();
    expect((await ok<PubWritten>(await ccall('PATCH', `/api/u/pub/${link}`, { listed: true }, { cookie: alice, now: NOW + 5 }))).pub.listedAt).toBe(NOW + 5);
  });

  it('with the flag gallery off, listed: true is 400 in POST and PATCH; unlisting is allowed', async () => {
    const alice = await signUp('alice');
    const off = cenvOf({ FLAG_GALLERY: false });
    expect((await post(alice, { ...META, listed: true }, payload(100), { env: off })).status).toBe(400);
    const id = await publish(alice, payload(100), META, { env: off });
    expect((await ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice, env: off })).status).toBe(400);
    expect((await ccall('PATCH', `/api/u/pub/${id}`, { listed: false }, { cookie: alice, env: off })).status).toBe(200);
  });

  it('a hidden run cannot be listed (403 hidden)', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice, payload(100), META, { env: CENV });
    await db.prepare("UPDATE publication SET state = 'hidden' WHERE id = ?1").bind(id).run();
    const res = await ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'hidden' });
  });

  it('holds listingsPerDay in the statement: parallel POSTs and PATCHes never pass it; listing again is free; a new UTC day counts anew', async () => {
    const alice = await signUp('alice');
    await setLimits('alice', { listingsPerDay: 3 });
    const posts = await Promise.all([1, 2, 3, 4, 5].map((s) => post(alice, { ...META, listed: true }, payload(100, s), { env: CENV })));
    expect(posts.map((r) => r.status).sort()).toEqual([200, 200, 200, 429, 429]);
    expect(await (posts.find((r) => r.status === 429) as Response).json()).toEqual({ error: 'too_many' });
    const links: string[] = [];
    for (let s = 10; s < 14; s++) links.push(await publish(alice, payload(100, s), META, { env: CENV }));
    const patches = await Promise.all(links.map((id) => ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice })));
    expect(patches.map((r) => r.status)).toEqual([429, 429, 429, 429]);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM publication WHERE listed_at IS NOT NULL').first<{ n: number }>())!.n).toBe(3);
    // An already listed run unlisted and listed again: no new listing.
    const listed = (await db.prepare('SELECT id FROM publication WHERE listed = 1 LIMIT 1').first<{ id: string }>())!.id;
    expect((await ccall('PATCH', `/api/u/pub/${listed}`, { listed: false }, { cookie: alice })).status).toBe(200);
    expect((await ccall('PATCH', `/api/u/pub/${listed}`, { listed: true }, { cookie: alice })).status).toBe(200);
    // Tomorrow (UTC).
    const tomorrow = await Promise.all(links.map((id) => ccall('PATCH', `/api/u/pub/${id}`, { listed: true }, { cookie: alice, now: NOW + DAY })));
    expect(tomorrow.map((r) => r.status).sort()).toEqual([200, 200, 200, 429]);
  });
});

describe('GET /api/gallery', () => {
  it('New, Most watched and Top with its weighted order; listed active runs only', async () => {
    const alice = await signUp('alice');
    const voters: string[] = [];
    for (let i = 0; i < 6; i++) {
      voters.push(await signUp(`voter${i}`));
      await ageAccount(`voter${i}`, 30);
    }
    const a = await list(alice, { now: NOW - 3000, title: 'A' });
    const b = await list(alice, { now: NOW - 2000, title: 'B', seed: 2 });
    const c = await list(alice, { now: NOW - 1000, title: 'C', seed: 3 });
    const link = await publish(alice, payload(100, 4), META, { env: CENV });
    const hidden = await list(alice, { now: NOW, title: 'H', seed: 5 });
    await db.prepare("UPDATE publication SET state = 'hidden' WHERE id = ?1").bind(hidden).run();
    // A: one 5 (prior pulls it down); B: six 4s; C: none.
    await voted(voters[0]!, a, 5);
    for (const v of voters) await voted(v, b, 4);
    await db.prepare('UPDATE publication SET views = 7 WHERE id = ?1').bind(a).run();
    await db.prepare('UPDATE publication SET views = 3 WHERE id = ?1').bind(c).run();

    const ids = (p: GalleryPage): string[] => p.rows.map((r) => r.id);
    expect(ids(await page('?sort=new'))).toEqual([c, b, a]);
    expect(ids(await page('?sort=watched'))).toEqual([a, c, b]);
    // m = (5 + 24) / 7; A: (5m + 5) / 6, B: (5m + 24) / 11, C: m.
    const m = 29 / 7;
    const score = { [a]: (5 * m + 5) / 6, [b]: (5 * m + 24) / 11, [c]: m };
    const top = ids(await page(''));
    expect(top).toEqual([a, b, c].sort((x, y) => score[y]! - score[x]!));
    expect(top).not.toContain(link);
    expect(top).not.toContain(hidden);
    const row = (await page('?sort=new')).rows[1]!;
    expect(row).toEqual({ id: b, title: 'B', sender: 'alice', character: 'Olev', level: 26, lengthS: 93, listedAt: NOW - 2000, views: 0, stars: { sum: 24, count: 6 }, comments: 0 });
  });

  it('votes of young accounts show in the stars but do not move Top', async () => {
    const alice = await signUp('alice');
    const a = await list(alice, { now: NOW - 2000, title: 'A' });
    const b = await list(alice, { now: NOW - 1000, title: 'B', seed: 2 });
    for (let i = 0; i < 5; i++) await voted(await signUp(`young${i}`), a, 5);
    const old = await signUp('old');
    await ageAccount('old', 8);
    await voted(old, b, 4);
    const p = await page('?sort=top');
    expect(p.rows.map((r) => r.id)).toEqual([b, a]);
    expect(p.rows[1]!.stars).toEqual({ sum: 25, count: 5 });
  });

  it('periods filter on listedAt; pages of 30, a page past the end is empty, 34 is the deepest', async () => {
    const alice = await signUp('alice');
    await setLimits('alice', { listingsPerDay: 100 });
    await list(alice, { now: NOW - 40 * DAY, title: 'old' });
    await list(alice, { now: NOW - 10 * DAY, title: 'month', seed: 2 });
    await list(alice, { now: NOW - DAY, title: 'week', seed: 3 });
    const titles = async (q: string): Promise<string[]> => (await page(q)).rows.map((r) => r.title);
    expect(await titles('?sort=new&period=week')).toEqual(['week']);
    expect(await titles('?sort=new&period=month')).toEqual(['week', 'month']);
    expect(await titles('?sort=new&period=all')).toEqual(['week', 'month', 'old']);
    for (let i = 0; i < 30; i++) await list(alice, { now: NOW - i, title: `n${i}`, seed: 10 + i });
    const one = await page('?sort=new&page=1');
    expect(one.rows).toHaveLength(30);
    expect(one.more).toBe(true);
    const two = await page('?sort=new&page=2');
    expect(two.rows.map((r) => r.title)).toEqual(['week', 'month', 'old']);
    expect(two.more).toBe(false);
    expect((await page('?sort=new&page=3')).rows).toEqual([]);
    expect((await page('?page=34')).rows).toEqual([]);
    for (const q of ['?page=0', '?page=35', '?page=1.5', '?page=x', '?sort=best', '?period=year', '?page=01']) expect((await ccall('GET', `/api/gallery${q}`)).status, q).toBe(400);
    // Unknown parameters are ignored.
    expect((await ccall('GET', '/api/gallery?x=1&sort=new')).status).toBe(200);
  });

  it('normalises the cache key and keeps an answer 60 s in the Cache API; without a cache every request reads', async () => {
    const store = new Map<string, Response>();
    const cache: CacheLike = {
      async match(r) {
        return store.get(r.url)?.clone();
      },
      async put(r, res) {
        store.set(r.url, res);
      },
    };
    const get = (q: string): Promise<Response> => handle(new Request(`${ORIGIN}/api/gallery${q}`, { headers: { 'cf-connecting-ip': '203.0.113.1' } }), CENV, { ...at(NOW, siteverify), cache });
    const alice = await signUp('alice');
    await list(alice);
    const first = await get('?page=1&utm=x');
    expect(first.headers.get('cache-control')).toBe('public, max-age=60');
    expect([...store.keys()]).toEqual([`${ORIGIN}/api/gallery?sort=top&period=all&page=1`]);
    await list(alice, { seed: 2 });
    // The same variant spelled otherwise: the kept answer.
    expect(((await (await get('?period=all&sort=top')).json()) as GalleryPage).rows).toHaveLength(1);
    expect(((await (await get('?sort=new')).json()) as GalleryPage).rows).toHaveLength(2);
    expect(store.size).toBe(2);
    // A 400 is not kept.
    expect((await get('?sort=bad')).status).toBe(400);
    expect(store.size).toBe(2);
    // A cache that fails is no cache.
    const broken: CacheLike = {
      match: () => Promise.reject(new Error('down')),
      put: () => Promise.reject(new Error('down')),
    };
    const res = await handle(new Request(`${ORIGIN}/api/gallery`), CENV, { ...at(NOW), cache: broken });
    expect(((await res.json()) as GalleryPage).rows).toHaveLength(2);
    expect(galleryParams(new URL(`${ORIGIN}/api/gallery`))).toEqual({ sort: 'top', period: 'all', page: 1 });
  });

  it('every new public path answers 404 with a flag off; POST is 405', async () => {
    for (const env of [cenvOf({ FLAG_GALLERY: false }), cenvOf({ FLAG_SHARE: false })]) {
      for (const path of ['/api/gallery', '/api/gallery/random', '/api/community', '/api/runes', '/api/pub/AAAAAAAAAAAA/comments']) {
        expect((await call('GET', path, undefined, { env })).status, path).toBe(404);
      }
    }
    expect((await call('GET', '/api/runes', undefined, { env: cenvOf({ FLAG_RUNES: false }) })).status).toBe(404);
    expect((await ccall('GET', '/api/gallery')).status).toBe(200);
    expect((await ccall('POST', '/api/gallery', {})).status).toBe(405);
  });
});

describe('GET /api/community and /api/gallery/random', () => {
  it('top posters, the Hall of Fame and the run of the day (fixed for the day, only runs listed before it)', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const a1 = await list(alice, { now: NOW - 3 * DAY });
    const a2 = await list(alice, { now: NOW - 2 * DAY, seed: 2 });
    const b1 = await list(bob, { now: NOW - 2 * DAY, seed: 3 });
    const fresh = await list(bob, { now: NOW, seed: 4 });
    const boxes = await ok<CommunityBoxes>(await ccall('GET', '/api/community'));
    expect(boxes.topPosters).toEqual([
      { name: 'alice', runs: 2 },
      { name: 'bob', runs: 2 },
    ]);
    expect(boxes.hallOfFame.map((r) => r.id).sort()).toEqual([a1, a2, b1, fresh].sort());
    expect([a1, a2, b1]).toContain(boxes.today!.id);
    expect([a1, a2, b1]).toContain(boxes.yesterday!.id);
    expect(boxes.mume).toBeUndefined();
    const again = await ok<CommunityBoxes>(await ccall('GET', '/api/community', undefined, { now: NOW + 3_600_000 }));
    expect(again.today!.id).toBe(boxes.today!.id);
    const random = await ok<GalleryRandom>(await ccall('GET', '/api/gallery/random'));
    expect([a1, a2, b1, fresh]).toContain(random.id);
    await emptyTables();
    expect(await ok<GalleryRandom>(await ccall('GET', '/api/gallery/random'))).toEqual({ id: null });
    expect((await ok<CommunityBoxes>(await ccall('GET', '/api/community'))).today).toBeNull();
  });

  it('carries MUME’s boxes from mume_cache only while they are under 24 hours old', async () => {
    const war = { west: [{ name: 'Olev', race: 'Human', class: 'Warrior' }], dark: [{ name: 'Grash', race: 'Orc', class: 'Ranger' }] };
    await db.prepare("INSERT INTO mume_cache (key, value, fetched) VALUES ('war', ?1, ?2), ('players', '312', ?3)").bind(JSON.stringify(war), NOW - 3_600_000, NOW - 25 * 3_600_000).run();
    expect((await ok<CommunityBoxes>(await ccall('GET', '/api/community'))).mume).toEqual(war);
    await db.prepare("UPDATE mume_cache SET fetched = ?1 WHERE key = 'players'").bind(NOW - 60_000).run();
    expect((await ok<CommunityBoxes>(await ccall('GET', '/api/community'))).mume).toEqual({ ...war, players: 312 });
    expect((await ok<CommunityBoxes>(await ccall('GET', '/api/community', undefined, { now: NOW + 24 * 3_600_000 }))).mume).toBeUndefined();
    await db.prepare("UPDATE mume_cache SET value = '{\"west\": 1}' WHERE key = 'war'").run();
    expect((await ok<CommunityBoxes>(await ccall('GET', '/api/community'))).mume).toBeUndefined();
  });
});

describe('the counters', () => {
  it('GET /api/stats/public carries the newest listed times with gallery on (also with stats off), none without', async () => {
    const alice = await signUp('alice');
    await list(alice, { now: NOW - 2000 });
    await list(alice, { now: NOW - 1000, seed: 2 });
    await publish(alice, payload(100, 3), META, { env: CENV });
    const s = await ok<PublicStats>(await ccall('GET', '/api/stats/public'));
    expect(s.listed).toEqual([NOW - 1000, NOW - 2000]);
    const noStats = await ok<PublicStats>(await ccall('GET', '/api/stats/public', undefined, { env: cenvOf({ FLAG_STATS: false }) }));
    expect(noStats).toEqual({ online: 0, playing: 0, listed: [NOW - 1000, NOW - 2000] });
    expect((await ok<PublicStats>(await ccall('GET', '/api/stats/public', undefined, { env: cenvOf({ FLAG_GALLERY: false }) }))).listed).toBeUndefined();
    expect((await ccall('GET', '/api/stats/public', undefined, { env: cenvOf({ FLAG_GALLERY: false, FLAG_STATS: false }) })).status).toBe(404);
  });

  it('news counts others’ listed runs after gallery seen and reactions on one’s own runs after reactions seen; seen moves forward only', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const mine = await list(alice, { now: NOW - 5000 });
    await list(bob, { now: NOW - 4000, seed: 2 });
    await list(bob, { now: NOW - 3000, seed: 3 });
    await voted(bob, mine, 4, { now: NOW - 2000 });
    await ccall('POST', `/api/u/pub/${mine}/comments`, { text: 'Well run.' }, { cookie: bob, now: NOW - 1000 });
    await ccall('POST', `/api/u/pub/${mine}/comments`, { text: 'My own.' }, { cookie: alice, now: NOW - 900 });
    const news = (cookie: string): Promise<CommunityNews> => ccall('GET', '/api/u/community/news', undefined, { cookie }).then((r) => ok<CommunityNews>(r));
    expect(await news(alice)).toEqual({ runs: 2, reactions: 2, newestRun: NOW - 3000, newestReaction: NOW - 1000 });
    expect(await news(bob)).toEqual({ runs: 1, reactions: 0, newestRun: NOW - 5000, newestReaction: null });
    const seen = await ok<CommunitySeen>(await ccall('POST', '/api/u/community/seen', { gallery: NOW - 4000 }, { cookie: alice }));
    expect(seen).toEqual({ gallery: NOW - 4000, reactions: 0 });
    expect((await news(alice)).runs).toBe(1);
    // From the future: now at most; older: no change.
    expect(await ok<CommunitySeen>(await ccall('POST', '/api/u/community/seen', { gallery: NOW + 99 * DAY, reactions: NOW - 1500 }, { cookie: alice }))).toEqual({ gallery: NOW, reactions: NOW - 1500 });
    expect(await ok<CommunitySeen>(await ccall('POST', '/api/u/community/seen', { gallery: 1 }, { cookie: alice }))).toEqual({ gallery: NOW, reactions: NOW - 1500 });
    expect(await news(alice)).toEqual({ runs: 0, reactions: 1, newestRun: null, newestReaction: NOW - 1000 });
    const p = (await ok<{ pubs: MyPub[] }>(await ccall('GET', '/api/u/pub', undefined, { cookie: alice }))).pubs[0]!;
    expect(p.news).toEqual({ votes: 0, comments: 1 });
    expect(p.stars).toEqual({ sum: 4, count: 1 });
    expect(p.comments).toBe(2);
    for (const b of [{}, { gallery: -1 }, { gallery: 1.5 }, { other: 1 }, { reactions: '1' }]) expect((await ccall('POST', '/api/u/community/seen', b, { cookie: alice })).status).toBe(400);
  });

  it('news caps each count at 99', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await setLimits('bob', { listingsPerDay: 1000 });
    const rows = Array.from({ length: 120 }, (_, i) => `('x${String(i).padStart(11, '0')}', '${'?'}', 'active', 1, ${NOW - i}, ${NOW}, ${NOW})`);
    const { id: bobId } = (await db.prepare("SELECT id FROM account WHERE name_key = 'bob'").first<{ id: string }>())!;
    await db.prepare(`INSERT INTO publication (id, account, state, listed, listed_at, created, updated) VALUES ${rows.join(', ').replaceAll("'?'", `'${bobId}'`)}`).run();
    expect((await ok<CommunityNews>(await ccall('GET', '/api/u/community/news', undefined, { cookie: alice }))).runs).toBe(99);
    expect((await ok<PublicStats>(await ccall('GET', '/api/stats/public'))).listed).toHaveLength(99);
  });
});

describe('views and metas', () => {
  const view = (id: string, dev: string, ip: string, now = NOW): Promise<Response> =>
    ccall('POST', `/api/pub/${id}/view`, { device: dev }, { ip, now, headers: { 'content-type': 'application/json' } });

  it('a view counts once per device and once per address (an IPv6 /64 is one) a UTC day', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    // Many minted device ids from one address: one view.
    for (let i = 0; i < 5; i++) expect((await view(id, device(), '198.51.100.9')).status).toBe(204);
    // One device from two addresses: one view.
    const d = device();
    await view(id, d, '198.51.100.10');
    await view(id, d, '198.51.100.11');
    // Two addresses of one /64: one view; another /64: another.
    await view(id, device(), '2001:db8:0:1::1');
    await view(id, device(), '2001:db8:0:1::2');
    await view(id, device(), '2001:db8:0:2::1');
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).views).toBe(4);
    // Tomorrow the address counts again.
    await view(id, device(), '198.51.100.9', NOW + DAY);
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).views).toBe(5);
    // The rows hold a hash, never the address.
    const keys = (await db.prepare("SELECT device FROM pub_view WHERE device LIKE 'a:%'").all<{ device: string }>()).results.map((r) => r.device);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).not.toMatch(/198\.51|2001/);
  });

  it('the public meta has listed, stars and comments only with gallery on', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    const on = await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`));
    expect(on).toMatchObject({ listed: true, stars: { sum: 0, count: 0 }, comments: 0 });
    const off = await ok<PubMeta>(await call('GET', `/api/pub/${id}`, undefined, { env: cenvOf({ FLAG_GALLERY: false }) }));
    expect(off.stars).toBeUndefined();
    expect(off.comments).toBeUndefined();
    expect(off.listed).toBeUndefined();
    expect(await count('publication')).toBe(1);
  });
});
