// Search of the list, `GET /api/gallery?q=` (stage 65, the owner's
// feedback; ADR 0155 "As built (stage 65, owner's feedback: W2)"): the
// title, character and sender of listed active runs, without regard to
// (ASCII) case, as a plain substring; the bounds after cleaning; the sorts,
// pages and `by` combined; never a hidden, removed or link-only run; never
// kept in the Cache API; the flags.
import { beforeEach, describe, expect, it } from 'vitest';
import type { GalleryPage } from '../../shared/cloud/api.ts';
import { searchText } from '../../shared/cloud/text.ts';
import { galleryParams } from '../community.ts';
import { handle } from '../router.ts';
import type { CacheLike } from '../runtime.ts';
import { at, db, emptyTables } from './helpers.ts';
import { META, ORIGIN, call, payload, publish, setLimits, signUp, siteverify } from './share-helpers.ts';
import { CENV, NOW, ccall, cenvOf, ok } from './community-helpers.ts';

beforeEach(async () => {
  await emptyTables();
});

const search = (q: string, more = ''): Promise<GalleryPage> => ccall('GET', `/api/gallery?q=${encodeURIComponent(q)}${more}`).then((r) => ok<GalleryPage>(r));
const ids = async (q: string, more = ''): Promise<string[]> => (await search(q, more)).rows.map((r) => r.id);

/** A listed run with its own title and character (at `now`). */
async function run(cookie: string, title: string, character: string, seed: number, o: { now?: number; listed?: boolean } = {}): Promise<string> {
  return publish(cookie, payload(100, seed), { ...META, title, character, listed: o.listed ?? true }, { env: CENV, now: o.now ?? NOW - seed * 1000 });
}

describe('GET /api/gallery?q=', () => {
  it('finds the text in the title, the character or the sender, any ASCII case; carries q; combines with the sorts', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bobwise');
    const t = await run(alice, 'Orcs at the Ford of Bruinen', 'Gibur', 1);
    const c = await run(alice, 'A quiet night', 'Fordwick', 2);
    const s = await run(bob, 'Trolls', 'Pip', 3);
    await run(bob, 'Nothing here', 'Pip', 4);
    expect(await ids('ford')).toEqual([t, c]);
    expect(await ids('FORD')).toEqual([t, c]);
    expect(await ids('  Bobwise ')).toEqual([s, (await search('nothing')).rows[0]!.id]);
    const p = await search('ford');
    expect(p).toMatchObject({ q: 'ford', total: 2, page: 1, more: false, sort: 'new' });
    // The text as cleaned: inner spaces as one.
    expect((await search('quiet    night')).q).toBe('quiet night');
    // Sorted by length (longest first; equal lengths: the newer).
    expect((await search('ford', '&sort=length')).rows).toHaveLength(2);
    // The list without q has no q.
    expect(await ok<GalleryPage>(await ccall('GET', '/api/gallery'))).not.toHaveProperty('q');
  });

  it('%, _ and a backslash are themselves (a substring, not a pattern)', async () => {
    const alice = await signUp('alice');
    const pct = await run(alice, '100% orcs', 'Gibur', 1);
    const und = await run(alice, 'snake_case troll', 'Gibur', 2);
    const bs = await run(alice, 'back\\slash', 'Gibur', 3);
    await run(alice, '100 orcs and more', 'Gibur', 4);
    await run(alice, 'snakeXcase', 'Gibur', 5);
    expect(await ids('0%')).toEqual([pct]);
    expect(await ids('%%')).toEqual([]);
    expect(await ids('e_c')).toEqual([und]);
    expect(await ids('__')).toEqual([]);
    expect(await ids('k\\s')).toEqual([bs]);
    // SQL in the text is text.
    expect(await ids("' OR 1=1 --")).toEqual([]);
  });

  it('2–60 code points after cleaning, or 400; refused characters are taken out first', async () => {
    const alice = await signUp('alice');
    await run(alice, 'Orcs', 'Gibur', 1);
    for (const q of ['', ' ', 'a', '  a  ', 'x'.repeat(61), '​​a', 'a\u0000', 'x'.repeat(2000)]) {
      const res = await ccall('GET', `/api/gallery?q=${encodeURIComponent(q)}`);
      expect(res.status, JSON.stringify(q)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_request' });
    }
    expect((await search('x'.repeat(60))).total).toBe(0);
    expect((await search('ab')).total).toBe(0);
    // Cleaning: a bidi override goes, NFC composes (e + U+0301 is é: two code points).
    expect((await search('O‮rcs')).q).toBe('Orcs');
    expect((await search('éx')).q).toBe('éx');
    expect(galleryParams(new URL(`${ORIGIN}/api/gallery?q=${encodeURIComponent(' Orc\n fight ')}`))).toMatchObject({ q: 'Orc fight' });
    expect(searchText('ab', 2, 60)).toBe('ab');
    expect(searchText('a', 2, 60)).toBeNull();
  });

  it('never finds a hidden, removed or link-only run, or a suspended sender’s', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const seen = await run(alice, 'Ford one', 'Gibur', 1);
    const hidden = await run(alice, 'Ford two', 'Gibur', 2);
    const removed = await run(alice, 'Ford three', 'Gibur', 3);
    await run(alice, 'Ford link', 'Gibur', 4, { listed: false });
    const bobs = await run(bob, 'Ford of bob', 'Gibur', 5);
    await db.prepare("UPDATE publication SET state = 'hidden' WHERE id = ?1").bind(hidden).run();
    await db.prepare("UPDATE publication SET state = 'removed' WHERE id = ?1").bind(removed).run();
    expect(await ids('ford')).toEqual([seen, bobs]);
    expect((await search('ford')).total).toBe(2);
    expect(await ids('link')).toEqual([]);
  });

  it('pages of 10 with total and more; combines with by', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await setLimits('alice', { listingsPerDay: 20 });
    const mine: string[] = [];
    for (let i = 1; i <= 13; i++) mine.push(await run(alice, `Ford ${i}`, 'Gibur', i));
    await run(bob, 'Ford of bob', 'Gibur', 20);
    const p1 = await search('ford');
    expect(p1).toMatchObject({ total: 14, more: true });
    expect(p1.rows).toHaveLength(10);
    const p2 = await search('ford', '&page=2');
    expect(p2).toMatchObject({ total: 14, more: false, page: 2 });
    expect(p2.rows).toHaveLength(4);
    const byAlice = await search('ford', '&by=alice&page=2');
    expect(byAlice).toMatchObject({ total: 13, more: false });
    expect(byAlice.rows.map((r) => r.id)).toEqual(mine.slice(10));
    expect((await search('ford', '&by=nobody')).total).toBe(0);
  });

  it('is never kept in the Cache API (the list without q still is); 404 with a flag off', async () => {
    const alice = await signUp('alice');
    await run(alice, 'Ford', 'Gibur', 1);
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
    expect((await get('?q=ford')).status).toBe(200);
    expect((await get('?q=ford&sort=top')).status).toBe(200);
    expect(store.size).toBe(0);
    await get('');
    expect([...store.keys()]).toEqual([`${ORIGIN}/api/gallery?sort=new&period=all&page=1`]);
    // A run listed after a search is found by the next one at once.
    await run(alice, 'Ford again', 'Gibur', 0, { now: NOW });
    expect(((await (await get('?q=ford')).json()) as GalleryPage).total).toBe(2);
    for (const env of [cenvOf({ FLAG_GALLERY: false }), cenvOf({ FLAG_SHARE: false })]) {
      expect((await call('GET', '/api/gallery?q=ford', undefined, { env })).status).toBe(404);
    }
  });
});
