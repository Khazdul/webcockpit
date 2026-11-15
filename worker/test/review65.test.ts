// Stage 65's review fixes on the Worker's community paths (ADR 0155 "As
// built (stage 65, review fixes)"; notes/research/stage65-security-review.md):
// one describe per finding.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PubMeta, PubWritten } from '../../shared/cloud/api.ts';
import { viewAddressKey, addressKey } from '../address.ts';
import { at, db, device, emptyTables } from './helpers.ts';
import { handle } from '../router.ts';
import type { CacheLike, D1, D1Statement } from '../runtime.ts';
import { vi } from 'vitest';
import { META, call, oldSignUp, post, publish, reportOf, signUp } from './share-helpers.ts';
import { DAY, NOW, ccall, cenvOf, commented, list, noted, ok, note } from './community-helpers.ts';
import { adminCall } from './admin-call.ts';
import type { AdminReports } from '../../shared/cloud/api.ts';

beforeEach(async () => {
  await emptyTables();
});

const cp = String.fromCodePoint;

describe('S1, S2: the free public text rules on the Worker', () => {
  it('refuses a tower of marks with ZWJ between them, an empty-looking note and a ZWJ run', async () => {
    const alice = await signUp('alice');
    const tower = `x${`${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(0x200d)}`.repeat(60)}`.slice(0, 250);
    for (const text of [tower, `${cp(0x200d)}${cp(0x200d)}`, cp(0x2800), `a${cp(0x206a)}b`, `a${cp(0xe000)}`, `a${cp(0x200d)}${cp(0x200d)}b`]) {
      const res = await note(alice, text);
      expect(res.status, JSON.stringify(text)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_text' });
    }
    expect((await note(alice, `${cp(0x2764)}${cp(0xfe0f)}${cp(0x200d)}${cp(0x1f525)} at the ford`)).status).toBe(200);
  });
});

describe('S3: a listed run’s title, description and character follow the free public text rules', () => {
  const patch = (cookie: string, id: string, body: unknown): Promise<Response> => ccall('PATCH', `/api/u/pub/${id}`, body, { cookie });
  const env = cenvOf({});

  it('POST with listed: true refuses a blank-looking or smuggling title, description or character (400 bad_text); link-only keeps stage 64’s rules', async () => {
    const alice = await signUp('alice');
    for (const over of [{ title: cp(0x3164) }, { title: `Orc${cp(0x200b)}s` }, { description: `Two${cp(0x00ad)} orcs` }, { character: `Olx${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(0x0313)}` }]) {
      const res = await post(alice, { ...META, ...over, listed: true }, undefined, { env });
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_text' });
      expect((await post(alice, { ...META, ...over, listed: false }, undefined, { env })).status, JSON.stringify(over)).toBe(200);
    }
    expect((await post(alice, { ...META, description: '', character: '', listed: true }, undefined, { env })).status).toBe(200);
  });

  it('PATCH to listed, or of the texts of a listed run, checks the texts the run will have', async () => {
    const alice = await signUp('alice');
    const linkOnly = (await ok<PubWritten>(await post(alice, { ...META, title: `Orc${cp(0x200b)}s` }, undefined, { env }))).pub.id;
    // Listing it with the stored title: refused; with a clean title in the same PATCH: listed.
    expect((await patch(alice, linkOnly, { listed: true })).status).toBe(400);
    expect((await ok<PubWritten>(await patch(alice, linkOnly, { listed: true, title: 'Orcs' }))).pub.listed).toBe(true);
    // A listed run's title or description: the rules.
    expect((await patch(alice, linkOnly, { title: cp(0x3164) })).status).toBe(400);
    expect((await patch(alice, linkOnly, { description: `a${cp(0x2800)}` })).status).toBe(400);
    expect((await patch(alice, linkOnly, { description: 'Two orcs.\nOne troll.' })).status).toBe(200);
    // Unlisted again: stage 64's rules.
    expect((await patch(alice, linkOnly, { listed: false })).status).toBe(200);
    expect((await patch(alice, linkOnly, { title: `Orc${cp(0x200b)}s` })).status).toBe(200);
  });
});

describe('S4: a view counts once a day per IPv6 /56', () => {
  const view = (id: string, ip: string): Promise<Response> => ccall('POST', `/api/pub/${id}/view`, { device: device() }, { ip, headers: { 'content-type': 'application/json' } });

  it('viewAddressKey is the /56, addressKey stays the /64', () => {
    expect(viewAddressKey('2001:db8:abcd:12ff::1')).toBe('2001:db8:abcd:1200::/56');
    expect(viewAddressKey('2001:db8:abcd:0012::1')).toBe('2001:db8:abcd:0::/56');
    expect(viewAddressKey('203.0.113.9')).toBe('203.0.113.9');
    expect(viewAddressKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(viewAddressKey('nonsense')).toBe('unknown');
    expect(addressKey('2001:db8:abcd:12ff::1')).toBe('2001:db8:abcd:12ff::/64');
  });

  it('one customer’s /64s add one view', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    for (let i = 0; i < 20; i++) expect((await view(id, `2001:db8:abcd:${i.toString(16)}::1`)).status).toBe(204);
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).views).toBe(1);
    await view(id, '2001:db8:abcd:100::1');
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).views).toBe(2);
  });
});

describe('S6: only reporters RANKING_AGE_DAYS old count towards the five that hide', () => {
  const report = (cookie: string, kind: string, target: string): Promise<Response> => ccall('POST', '/api/u/report', { kind, target, reason: 'rules' }, { cookie });
  const stateOf = async (table: string, id: string): Promise<string | undefined> =>
    (await db.prepare(`SELECT state FROM ${table} WHERE id = ?1`).bind(id).first<{ state: string }>())?.state;

  it('five fresh accounts queue a run, a comment and a note for the admin but hide none; one more old one with four old ones does', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const run = await list(alice);
    const c = await commented(bob, run, 'Nice fight.');
    const n = await noted(bob, 'Orcs at the ford.');
    const items: [string, string, string][] = [['run', 'publication', run], ['comment', 'comment', c], ['note', 'note', n]];
    for (let i = 0; i < 5; i++) {
      const fresh = await signUp(`fresh${i}`);
      for (const [kind, , id] of items) expect((await report(fresh, kind, id)).status).toBe(204);
    }
    for (const [, table, id] of items) expect(await stateOf(table, id)).toBe('active');
    const q = await ok<AdminReports>(await adminCall('/api/admin/reports'));
    expect(q.items.map((i) => [i.kind, i.reporters]).sort()).toEqual([['comment', 5], ['note', 5], ['run', 5]]);
    // Four old reporters with the five fresh: still not five that count.
    for (let i = 0; i < 4; i++) {
      const old = await oldSignUp(`old${i}`);
      for (const [kind, , id] of items) expect((await report(old, kind, id)).status).toBe(204);
    }
    for (const [, table, id] of items) expect(await stateOf(table, id)).toBe('active');
    const fifth = await oldSignUp('old4');
    for (const [kind, , id] of items) expect((await report(fifth, kind, id)).status).toBe(204);
    for (const [, table, id] of items) expect(await stateOf(table, id)).toBe('hidden');
  });
});

describe('S7: a hidden comment or note cannot be removed by its writer or the run’s sender', () => {
  it('403 hidden; the reports stay open and the admin still sees the text', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const run = await list(alice);
    const c = await commented(bob, run, 'You are a bad player.');
    const n = await noted(bob, 'Buy gold at my shop');
    for (let i = 0; i < 5; i++) {
      const r = await oldSignUp(`rep${i}`);
      expect((await ccall('POST', '/api/u/report', { kind: 'comment', target: c, reason: 'harassment' }, { cookie: r })).status).toBe(204);
      expect((await ccall('POST', '/api/u/report', { kind: 'note', target: n, reason: 'rules' }, { cookie: r })).status).toBe(204);
    }
    for (const [cookie, path] of [[bob, `/api/u/comments/${c}`], [alice, `/api/u/comments/${c}`], [bob, `/api/u/runes/${n}`]] as const) {
      const res = await ccall('DELETE', path, undefined, { cookie });
      expect(res.status, path).toBe(403);
      expect(await res.json()).toEqual({ error: 'hidden' });
    }
    expect((await db.prepare('SELECT COUNT(*) AS n FROM report WHERE handled = 0').first<{ n: number }>())?.n).toBe(10);
    const q = await ok<AdminReports>(await adminCall('/api/admin/reports'));
    expect(q.items.map((i) => [i.kind, i.content, i.state]).sort()).toEqual([
      ['comment', 'You are a bad player.', 'hidden'],
      ['note', 'Buy gold at my shop', 'hidden'],
    ]);
    // Restored by the admin: the writer may remove it again.
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'restore' })).status).toBe(204);
    expect((await ccall('DELETE', `/api/u/comments/${c}`, undefined, { cookie: bob })).status).toBe(204);
  });
});

describe('S8: a suspended writer’s comments and notes are not shown; comment_count follows', () => {
  const countOf = async (id: string): Promise<number> => (await db.prepare('SELECT comment_count AS n FROM publication WHERE id = ?1').bind(id).first<{ n: number }>())!.n;
  /** comment_count against a recount: active comments of active writers. */
  const expectCount = async (id: string): Promise<number> => {
    const recount = await db
      .prepare(`SELECT COUNT(*) AS n FROM comment c JOIN account a ON a.id = c.account WHERE c.publication = ?1 AND c.state = 'active' AND a.state = 'active'`)
      .bind(id)
      .first<{ n: number }>();
    const stored = await countOf(id);
    expect(stored, `comment_count of ${id}`).toBe(recount!.n);
    return stored;
  };
  const suspend = (name: string, action: 'suspend' | 'restore'): Promise<Response> => adminCall(`/api/admin/account/${name}`, { action });

  it('the list, the board, the meta and the news leave them out; Restore brings them back; the counts recount', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const carol = await signUp('carol');
    const run = await list(alice);
    const other = await list(carol, { seed: 2 });
    await commented(bob, run, 'Spam one', { now: NOW + 1 });
    await commented(bob, run, 'Spam two', { now: NOW + 2 });
    await commented(bob, other, 'Spam three', { now: NOW + 3 });
    await commented(carol, run, 'Nice fight.', { now: NOW + 4 });
    await noted(bob, 'Buy gold');
    await noted(carol, 'Orcs at the ford');
    expect(await expectCount(run)).toBe(3);
    expect((await suspend('bob', 'suspend')).status).toBe(204);
    // Twice is no second move.
    expect((await suspend('bob', 'suspend')).status).toBe(204);
    expect(await expectCount(run)).toBe(1);
    expect(await expectCount(other)).toBe(0);
    const page = await ok<{ comments: { writer: string }[]; total: number }>(await ccall('GET', `/api/pub/${run}/comments`));
    expect(page.comments.map((c) => c.writer)).toEqual(['carol']);
    expect(page.total).toBe(1);
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${run}`))).comments).toBe(1);
    const board = await ok<{ notes: { writer: string }[] }>(await ccall('GET', '/api/runes'));
    expect(board.notes.map((n) => n.writer)).toEqual(['carol']);
    const news = await ok<{ reactions: number }>(await ccall('GET', '/api/u/community/news', undefined, { cookie: alice }));
    expect(news.reactions).toBe(1);
    // The run's sender removes a suspended writer's comment: no count to give back.
    const spam = (await db.prepare("SELECT id FROM comment WHERE text = 'Spam one'").first<{ id: string }>())!.id;
    expect((await ccall('DELETE', `/api/u/comments/${spam}`, undefined, { cookie: alice })).status).toBe(204);
    expect(await expectCount(run)).toBe(1);
    expect((await suspend('bob', 'restore')).status).toBe(204);
    expect(await expectCount(run)).toBe(2);
    expect(await expectCount(other)).toBe(1);
    expect((await ok<{ notes: unknown[] }>(await ccall('GET', '/api/runes'))).notes).toHaveLength(2);
  });

  it('the admin’s hide and restore of a suspended writer’s comment, and Delete account of a suspended writer, keep the count', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const run = await list(alice);
    const c = await commented(bob, run, 'Spam');
    await commented(alice, run, 'Mine');
    expect((await suspend('bob', 'suspend')).status).toBe(204);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'hide' })).status).toBe(204);
    expect(await expectCount(run)).toBe(1);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'restore' })).status).toBe(204);
    expect(await expectCount(run)).toBe(1);
    expect((await suspend('bob', 'restore')).status).toBe(204);
    expect(await expectCount(run)).toBe(2);
    expect((await suspend('bob', 'suspend')).status).toBe(204);
    expect((await adminCall('/api/admin/account/bob', { action: 'delete', confirm: 'bob' })).status).toBe(204);
    expect(await expectCount(run)).toBe(1);
  });
});

/** The database, with every round trip (a statement run on its own, or a batch) and every SQL text written down. */
function countingDb(): { db: D1; trips: string[]; sql: string[] } {
  const trips: string[] = [];
  const sql: string[] = [];
  const real = new WeakMap<object, D1Statement>();
  const wrap = (st: D1Statement, text: string): D1Statement => {
    const w: D1Statement = {
      bind: (...v: unknown[]) => wrap(st.bind(...v), text),
      first: <T,>() => (trips.push(text), st.first<T>()),
      all: <T,>() => (trips.push(text), st.all<T>()),
      run: <T,>() => (trips.push(text), st.run<T>()),
    };
    real.set(w, st);
    return w;
  };
  return {
    trips,
    sql,
    db: {
      prepare: (text: string) => (sql.push(text), wrap(db.prepare(text), text)),
      batch: <T,>(list: D1Statement[]) => (trips.push('batch'), db.batch<T>(list.map((x) => real.get(x) ?? x))),
    },
  };
}

describe('S9: by= resolves the name first; an unknown name costs one lookup and no cache entry', () => {
  it('an unknown or deleted name: an empty page, no list query, nothing kept', async () => {
    const alice = await signUp('alice');
    await list(alice);
    const store = new Map<string, Response>();
    const cache: CacheLike = {
      async match(r) {
        return store.get(r.url)?.clone();
      },
      async put(r, res) {
        store.set(r.url, res);
      },
    };
    const counted = countingDb();
    const env = cenvOf({ DB: counted.db });
    const get = (q: string): Promise<Response> => handle(new Request(`https://example.test/api/gallery${q}`, { headers: { 'cf-connecting-ip': '203.0.113.1' } }), env, { ...at(NOW), cache });
    for (const name of ['aaa1', 'aaa2', 'nobody']) {
      const page = await ok<{ rows: unknown[]; total: number; more: boolean }>(await get(`?sort=top&by=${name}`));
      expect(page).toMatchObject({ rows: [], total: 0, more: false });
    }
    expect(counted.sql.filter((q) => /FROM publication/.test(q))).toEqual([]);
    expect(counted.trips.filter((t) => /FROM account WHERE name_key/.test(t))).toHaveLength(3);
    expect(store.size).toBe(0);
    // A known name: its runs, kept under the name.
    expect((await ok<{ rows: unknown[] }>(await get('?sort=top&by=Alice'))).rows).toHaveLength(1);
    expect([...store.keys()]).toEqual(['https://example.test/api/gallery?sort=top&period=all&page=1&by=alice']);
  });
});

describe('CR5: GET /api/community imports the HMAC key once and batches its reads', () => {
  it('one key import for many runs; the list reads in one batch', async () => {
    const alice = await signUp('alice');
    for (let i = 0; i < 6; i++) await list(alice, { now: NOW - 2 * DAY + i, seed: i + 1 });
    const counted = countingDb();
    const spy = vi.spyOn(crypto.subtle, 'importKey');
    try {
      const boxes = await ok<{ today: { id: string } | null; hallOfFame: unknown[] }>(
        await handle(new Request('https://example.test/api/community', { headers: { 'cf-connecting-ip': '203.0.113.1' } }), cenvOf({ DB: counted.db }), at(NOW)),
      );
      expect(boxes.today).not.toBeNull();
      expect(boxes.hallOfFame).toHaveLength(6);
      expect(spy.mock.calls.filter((c) => (c[2] as { name?: string }).name === 'HMAC')).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
    // The run ids and the Hall of Fame in one batch; then the day's run and MUME's boxes.
    expect(counted.trips.filter((t) => t === 'batch')).toHaveLength(1);
    expect(counted.trips.filter((t) => /FROM publication/.test(t))).toHaveLength(1);
  });
});

describe('CR8: the admin’s queue is one query over runs, comments and notes', () => {
  it('one statement, ordered by reporters then newest across the kinds', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const run = await list(alice);
    const c = await commented(bob, run, 'Rude');
    const n = await noted(bob, 'Spam');
    const rep = async (cookie: string, kind: string, target: string, now: number): Promise<void> => {
      expect((await ccall('POST', '/api/u/report', { kind, target, reason: 'rules' }, { cookie, now })).status).toBe(204);
    };
    const r1 = await signUp('rep1');
    const r2 = await signUp('rep2');
    await rep(r1, 'note', n, NOW + 1);
    await rep(r1, 'run', run, NOW + 2);
    await rep(r2, 'run', run, NOW + 3);
    await rep(r1, 'comment', c, NOW + 4);
    const counted = countingDb();
    const q = await ok<AdminReports>(await adminCall('/api/admin/reports', undefined, { env: cenvOf({ DB: counted.db }) }));
    expect(q.items.map((i) => [i.kind, i.reporters, i.content ?? null, i.pub ?? null])).toEqual([
      ['run', 2, null, null],
      ['comment', 1, 'Rude', run],
      ['note', 1, 'Spam', null],
    ]);
    expect(counted.sql.filter((t) => /FROM report r JOIN/.test(t))).toHaveLength(1);
  });
});

describe('CR1: comments by cursor, newest page first', () => {
  it('page=last is the newest 50; a comment removed meanwhile skips none of the earlier ones', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const run = await list(alice);
    await db.prepare('UPDATE account SET limits = ?1 WHERE name_key = ?2').bind(JSON.stringify({ commentsPerHour: 1000 }), 'bob').run();
    const ids: string[] = [];
    for (let i = 0; i < 120; i++) ids.push(await commented(bob, run, `c${i}`, { now: NOW + i }));
    type Page = { comments: { id: string; text: string }[]; more: boolean; before?: string; page?: number };
    const get = async (q: string): Promise<Page> => ok<Page>(await ccall('GET', `/api/pub/${run}/comments${q}`));
    const texts = (p: Page): string[] => p.comments.map((c) => c.text);
    const range = (a: number, b: number): string[] => Array.from({ length: b - a }, (_, i) => `c${a + i}`);
    const newest = await get('');
    expect(texts(newest)).toEqual(range(70, 120));
    expect(texts(await get('?page=last'))).toEqual(range(70, 120));
    // The writer removes one of the newest page while the reader looks: the next page still starts right before c70.
    expect((await ccall('DELETE', `/api/u/comments/${ids[100]}`, undefined, { cookie: bob })).status).toBe(204);
    const earlier = await get(`?before=${newest.before}`);
    expect(texts(earlier)).toEqual(range(20, 70));
    expect(earlier.more).toBe(true);
    const oldest = await get(`?before=${earlier.before}`);
    expect(texts(oldest)).toEqual(range(0, 20));
    expect(oldest.more).toBe(false);
  });
});

export { DAY, NOW, call, db, publish, reportOf };
