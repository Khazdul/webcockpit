// The admin panel's endpoints (stage 66, ADR 0157; contract "The admin
// panel" in shared/cloud/api.ts), through the router as the owner.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Account,
  type AdminAccountDetail,
  type AdminAccounts,
  type AdminGraphs,
  type AdminLimits,
  type AdminLogPage,
  type Config,
  DEFAULT_ACCOUNT_LIMITS,
} from '../../shared/cloud/api.ts';
import { LIMITS_CACHE_MS, forgetLimitDefaults } from '../limits.ts';
import { recordBeat, rollUp } from '../stats.ts';
import { DAY_MS } from '../runtime.ts';
import { count, db, device, emptyTables } from './helpers.ts';
import { NOW, admin, adminEnv, adminJson, forgetAccessKeys } from './access-helpers.ts';
import { CENV, commented, list, noted, voted } from './community-helpers.ts';
import { call, payload, post, publish, reportOf, signUp } from './share-helpers.ts';

const MB = 1024 * 1024;

beforeEach(async () => {
  await emptyTables();
  forgetAccessKeys();
});

const put = (path: string, body: unknown) => admin(path, { method: 'PUT', body });

async function accountOf(cookie: string): Promise<Account> {
  const res = await call('GET', '/api/u/account', undefined, { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { account: Account }).account;
}

describe('GET /api/admin/accounts', () => {
  it('lists every account with its figures; search, filter, sort and pages', async () => {
    const alice = await signUp('Alice');
    await publish(alice, payload(500));
    await signUp('bob');
    await signUp('car_l');
    await signUp('carol');
    await db.prepare("UPDATE account SET state = 'suspended', last_seen = 5 WHERE name_key = 'bob'").run();
    await db.prepare("UPDATE account SET item_count = 3, item_bytes = 1000, run_bytes = 2000 WHERE name_key = 'carol'").run();
    await db.prepare("INSERT INTO run_body (account, id, size, created) SELECT id, 'r1', 2000, 1 FROM account WHERE name_key = 'carol'").run();

    const all = await adminJson<AdminAccounts>('/api/admin/accounts');
    expect(all).toMatchObject({ total: 4, page: 1, pageSize: 50, totals: { accounts: 4, bytes: 3500 } });
    expect(all.accounts.find((a) => a.name === 'Alice')).toEqual({
      name: 'Alice',
      created: NOW,
      lastSeen: NOW,
      state: 'active',
      items: 0,
      itemBytes: 0,
      runs: 0,
      runBytes: 0,
      pubs: 1,
      pubBytes: 500,
      bytes: 500,
      sessions: 1,
      ownLimits: false,
    });
    expect(all.accounts.find((a) => a.name === 'carol')).toMatchObject({ items: 3, runs: 1, bytes: 3000 });

    const names = async (q: string): Promise<string[]> => (await adminJson<AdminAccounts>(`/api/admin/accounts${q}`)).accounts.map((a) => a.name);
    expect(await names('?sort=name&dir=asc')).toEqual(['Alice', 'bob', 'car_l', 'carol']);
    expect(await names('?sort=bytes')).toEqual(['carol', 'Alice', 'bob', 'car_l']);
    expect(await names('?q=ALI')).toEqual(['Alice']);
    // `_` and `%` are the name's own characters, not wildcards.
    expect(await names('?q=r_')).toEqual(['car_l']);
    expect(await names('?q=%25')).toEqual([]);
    expect(await names('?state=suspended')).toEqual(['bob']);
    expect((await adminJson<AdminAccounts>('/api/admin/accounts?state=active')).total).toBe(3);
    expect((await names('?sort=seen&dir=asc'))[0]).toBe('bob');
    expect(await names('?page=2')).toEqual([]);
    for (const q of ['?sort=size', '?dir=up', '?state=gone', '?page=0', '?page=x', `?q=${'a'.repeat(21)}`]) {
      expect((await admin(`/api/admin/accounts${q}`)).status, q).toBe(400);
    }
  });

  it('pages of 50', async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      db
        .prepare("INSERT INTO account (id, name, name_key, created, last_seen, salt, kdf, auth_hash, recovery_hash, wrap_pw, wrap_rc) VALUES (?1, ?2, ?2, ?3, ?3, 's', '{}', 'h', 'r', 'w', 'w')")
        .bind(`id${i}`, `user${String(i).padStart(2, '0')}`, i),
    );
    await db.batch(rows);
    const first = await adminJson<AdminAccounts>('/api/admin/accounts?sort=name&dir=asc');
    expect(first.accounts).toHaveLength(50);
    expect(first.total).toBe(51);
    expect((await adminJson<AdminAccounts>('/api/admin/accounts?sort=name&dir=asc&page=2')).accounts.map((a) => a.name)).toEqual(['user50']);
  });
});

describe('GET /api/admin/account/<name>', () => {
  it('one account in full: its row, limits, sessions (count and last use), community and its log', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const run = await list(alice);
    const bobs = await list(bob, { seed: 4 });
    await voted(alice, bobs, 5);
    const c = await commented(alice, bobs);
    await noted(alice);
    expect((await reportOf(alice, bobs, {}, { env: CENV })).status).toBe(204);
    expect((await reportOf(bob, run, {}, { env: CENV })).status).toBe(204);
    expect((await call('POST', '/api/u/report', { kind: 'comment', target: c, reason: 'harassment' }, { cookie: bob, env: CENV })).status).toBe(204);
    expect((await admin(`/api/admin/pub/${run}`, { body: { action: 'dismiss' } })).status).toBe(204);
    expect((await admin('/api/admin/flags/stats', { method: 'PUT', body: { value: true } })).status).toBe(200);
    expect((await put('/api/admin/account/alice/limits', { limits: { runBytes: 200 * MB } })).status).toBe(200);
    expect((await admin('/api/admin/account/bob', { body: { action: 'suspend' } })).status).toBe(204);

    const d = await adminJson<AdminAccountDetail>('/api/admin/account/ALICE');
    expect(d.account).toMatchObject({ name: 'alice', pubs: 1, ownLimits: true, sessions: 1 });
    expect(d.sessions).toEqual({ count: 1, lastUsed: NOW });
    expect(d.community).toEqual({ listed: 1, votes: 1, comments: 1, notes: 1, reportsMade: 1, reportsOpen: 1 });
    expect(d.limits.own).toEqual({ runBytes: 200 * MB });
    expect(d.limits.effective).toEqual({ ...DEFAULT_ACCOUNT_LIMITS, runBytes: 200 * MB });
    expect(d.limits.defaults).toEqual(DEFAULT_ACCOUNT_LIMITS);
    expect(d.limits.builtIn).toEqual(DEFAULT_ACCOUNT_LIMITS);
    // Its entries only: the run's and its own; not bob's, not the flag's.
    expect(d.log.map((e) => [e.action, e.target, e.sealed])).toEqual([
      ['account.limits', 'alice', true],
      ['pub.dismiss', run, true],
    ]);
    expect(d.log[0]?.note).toBe('runBytes 50 MB → 200 MB');
    expect(d.log[0]?.by).toMatch(/^[A-Za-z0-9_-]{8}$/);
    // Never the sessions' labels.
    expect(JSON.stringify(d)).not.toContain('Firefox');

    expect((await admin('/api/admin/account/nobody')).status).toBe(404);
    expect((await admin('/api/admin/account/%E0%A4%A')).status).toBe(404);
  });

  it('S6: an account named like another one’s run id does not get that run’s entries; its own account entries it does', async () => {
    const bob = await signUp('bob');
    const run = await publish(bob);
    // A name equal to the run's id, its case swapped (names are any case; ids are not).
    const lookalike = [...run].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join('');
    await signUp(lookalike);
    expect((await admin(`/api/admin/pub/${run}`, { body: { action: 'hide' } })).status).toBe(204);
    expect((await admin(`/api/admin/account/${lookalike}`, { body: { action: 'suspend' } })).status).toBe(204);
    const d = await adminJson<AdminAccountDetail>(`/api/admin/account/${lookalike}`);
    expect(d.log.map((e) => [e.action, e.target])).toEqual([['account.suspend', lookalike]]);
    const b = await adminJson<AdminAccountDetail>('/api/admin/account/bob');
    expect(b.log.map((e) => [e.action, e.target])).toEqual([['pub.hide', run]]);
  });
});

describe('limits', () => {
  it('PUT /api/admin/account/<name>/limits: stored only where it differs; null back to the defaults; logged; the account sees them', async () => {
    const alice = await signUp('alice');
    const res = await put('/api/admin/account/alice/limits', { limits: { runBytes: 200 * MB, items: DEFAULT_ACCOUNT_LIMITS.items }, note: 'asked nicely' });
    expect(res.status).toBe(200);
    const l = (await res.json()) as AdminLimits;
    expect(l.own).toEqual({ runBytes: 200 * MB });
    expect(l.effective?.runBytes).toBe(200 * MB);
    expect((await db.prepare("SELECT limits FROM account WHERE name_key = 'alice'").first())).toEqual({ limits: JSON.stringify({ runBytes: 200 * MB }) });
    expect((await accountOf(alice)).limits.runBytes).toBe(200 * MB);

    expect((await put('/api/admin/account/alice/limits', { limits: null })).status).toBe(200);
    expect((await db.prepare("SELECT limits FROM account WHERE name_key = 'alice'").first())).toEqual({ limits: null });
    expect((await put('/api/admin/account/alice/limits', { limits: {} })).status).toBe(200);

    const log = await adminJson<AdminLogPage>('/api/admin/log?kind=limits');
    expect(log.entries.map((e) => e.note)).toEqual(['no change', 'runBytes 200 MB → 50 MB', 'runBytes 50 MB → 200 MB — asked nicely']);
  });

  it('bad values are 400 and write nothing: an unknown key, not a whole number, below 0, above 20 × the built-in value', async () => {
    await signUp('alice');
    for (const body of [
      { limits: { nope: 1 } },
      { limits: { items: 1.5 } },
      { limits: { items: -1 } },
      { limits: { items: '10' } },
      { limits: { items: 20 * DEFAULT_ACCOUNT_LIMITS.items + 1 } },
      { limits: [] },
      { limits: { items: 1 }, extra: 1 },
      {},
      { limits: { items: 1 }, note: 'x'.repeat(501) },
    ]) {
      expect((await put('/api/admin/account/alice/limits', body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect((await put('/api/admin/account/alice/limits', { limits: { items: 20 * DEFAULT_ACCOUNT_LIMITS.items, sharedRuns: 0 } })).status).toBe(200);
    expect((await put('/api/admin/account/nobody/limits', { limits: {} })).status).toBe(404);
    expect(await count('admin_log')).toBe(1);
  });

  it('a limit below the use deletes nothing; the next write past it is refused', async () => {
    const alice = await signUp('alice');
    await publish(alice, payload(100));
    expect((await put('/api/admin/account/alice/limits', { limits: { sharedRuns: 0 } })).status).toBe(200);
    expect(await count('publication')).toBe(1);
    const res = await post(alice, undefined, payload(100));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'pub_quota', limit: 0 });
    expect(await count('publication')).toBe(1);
  });

  it('GET/PUT /api/admin/limits: the defaults for everyone, in /api/config and every account without its own; logged', async () => {
    const alice = await signUp('alice');
    await signUp('bob');
    expect((await put('/api/admin/account/bob/limits', { limits: { notesPerDay: 9 } })).status).toBe(200);
    expect(await adminJson<AdminLimits>('/api/admin/limits')).toEqual({ builtIn: DEFAULT_ACCOUNT_LIMITS, defaults: DEFAULT_ACCOUNT_LIMITS });

    const res = await put('/api/admin/limits', { defaults: { runBytes: 100 * MB, notesPerDay: DEFAULT_ACCOUNT_LIMITS.notesPerDay, items: 3000 } });
    expect(res.status).toBe(200);
    const want = { ...DEFAULT_ACCOUNT_LIMITS, runBytes: 100 * MB, items: 3000 };
    expect(await res.json()).toEqual({ builtIn: DEFAULT_ACCOUNT_LIMITS, defaults: want });
    // Only what differs from the built-in values is stored.
    expect((await db.prepare('SELECT name, value FROM limit_default ORDER BY name').all()).results).toEqual([
      { name: 'items', value: 3000 },
      { name: 'runBytes', value: 100 * MB },
    ]);
    const config = (await (await call('GET', '/api/config')).json()) as Config;
    expect(config.limits).toEqual(want);
    expect((await accountOf(alice)).limits).toEqual(want);
    // Bob's own value stays; the rest follows the defaults.
    const bob = await adminJson<AdminAccountDetail>('/api/admin/account/bob');
    expect(bob.limits.effective).toEqual({ ...want, notesPerDay: 9 });
    expect(bob.limits.defaults).toEqual(want);

    expect((await put('/api/admin/limits', { defaults: { items: -1 } })).status).toBe(400);
    expect((await put('/api/admin/limits', { defaults: { runBytes: 20 * DEFAULT_ACCOUNT_LIMITS.runBytes + 1 } })).status).toBe(400);
    expect((await put('/api/admin/limits', { limits: {} })).status).toBe(400);
    expect(await count('limit_default')).toBe(2);

    expect((await put('/api/admin/limits', { defaults: null, note: 'back' })).status).toBe(200);
    expect(await count('limit_default')).toBe(0);
    const log = await adminJson<AdminLogPage>('/api/admin/log?kind=limits');
    expect(log.entries.map((e) => [e.action, e.target, e.note])).toEqual([
      ['limits.default', 'defaults', 'items 3000 → 2000, runBytes 100 MB → 50 MB — back'],
      ['limits.default', 'defaults', 'items 2000 → 3000, runBytes 50 MB → 100 MB'],
      ['account.limits', 'bob', 'notesPerDay 5 → 9'],
    ]);
  });

  it('another isolate sees a change of the defaults within 30 s', async () => {
    const alice = await signUp('alice');
    expect((await accountOf(alice)).limits.items).toBe(DEFAULT_ACCOUNT_LIMITS.items);
    // Written behind this isolate's back (another isolate's PUT).
    await db.prepare("INSERT INTO limit_default (name, value) VALUES ('items', 7)").run();
    expect((await accountOf(alice)).limits.items).toBe(DEFAULT_ACCOUNT_LIMITS.items);
    const later = await call('GET', '/api/u/account', undefined, { cookie: alice, now: NOW + LIMITS_CACHE_MS });
    expect(((await later.json()) as { account: Account }).account.limits.items).toBe(7);
    forgetLimitDefaults(db);
  });

  it('a failing or missing limit_default table leaves the built-in values', async () => {
    const failing = { prepare: () => ({ all: async () => { throw new Error('down'); } }) } as never;
    const { loadLimitDefaults } = await import('../limits.ts');
    expect(await loadLimitDefaults({ DB: failing }, NOW)).toEqual({});
  });
});

describe('end-sessions', () => {
  it('ends every session of the account with the reason ended; logged', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    expect((await admin('/api/admin/account/alice', { body: { action: 'end-sessions', note: 'lost phone' } })).status).toBe(204);
    const res = await call('GET', '/api/u/account', undefined, { cookie: alice });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'session_ended', reason: 'ended' });
    expect((await call('GET', '/api/u/account', undefined, { cookie: bob })).status).toBe(200);
    const log = await adminJson<AdminLogPage>('/api/admin/log?kind=accounts');
    expect(log.entries.map((e) => [e.action, e.target, e.note])).toEqual([['account.end-sessions', 'alice', 'lost phone']]);
  });
});

describe('flags are logged', () => {
  it('a switch writes flag.on / flag.off with the flag as target, in the same batch', async () => {
    expect((await put('/api/admin/flags/share', { value: true })).status).toBe(200);
    expect((await put('/api/admin/flags/share', { value: false })).status).toBe(200);
    const log = await adminJson<AdminLogPage>('/api/admin/log?kind=flags');
    expect(log.entries.map((e) => [e.action, e.target])).toEqual([
      ['flag.off', 'share'],
      ['flag.on', 'share'],
    ]);
  });
});

describe('GET /api/admin/log', () => {
  it('newest first, 100 a page with `next`, filtered by kind and by a part of the target', async () => {
    const statements = [];
    for (let i = 0; i < 150; i++) {
      const action = i % 3 === 0 ? 'pub.hide' : i % 3 === 1 ? 'account.suspend' : 'flag.on';
      statements.push({ ts: i, who: 'w'.repeat(22), action, target: `target${i}`, note: '' });
    }
    const { sealedBatch } = await import('../auditlog.ts');
    const { realEnv } = await import('./helpers.ts');
    for (const l of statements) await sealedBatch(realEnv, db, l, (e) => [e]);

    const first = await adminJson<AdminLogPage>('/api/admin/log');
    expect(first.entries).toHaveLength(100);
    expect(first.total).toBe(150);
    expect(first.entries[0]).toMatchObject({ ts: 149, target: 'target149', by: 'wwwwwwww', sealed: true });
    expect(first.chain).toMatchObject({ state: 'intact', sealed: 150, unsealed: 0 });
    expect(first.next).toBe(first.entries[99]?.id);
    const second = await adminJson<AdminLogPage>(`/api/admin/log?before=${first.next}`);
    expect(second.entries).toHaveLength(50);
    expect(second.next).toBeNull();
    expect(second.entries.at(-1)?.ts).toBe(0);

    const mod = await adminJson<AdminLogPage>('/api/admin/log?kind=moderation');
    expect(mod.total).toBe(50);
    expect(mod.entries.every((e) => e.action === 'pub.hide')).toBe(true);
    const q = await adminJson<AdminLogPage>('/api/admin/log?q=TARGET14');
    expect(q.entries.map((e) => e.target)).toEqual(['target149', 'target148', 'target147', 'target146', 'target145', 'target144', 'target143', 'target142', 'target141', 'target140', 'target14']);
    for (const bad of ['?kind=nope', '?before=0', '?before=x', `?q=${'a'.repeat(65)}`]) expect((await admin(`/api/admin/log${bad}`)).status, bad).toBe(400);
  });
});

describe('GET /api/admin/log?chain=0 (review fix S4)', () => {
  /** The router's env with a database that adds up the rows each batch read. */
  function counting(): { env: ReturnType<typeof adminEnv>; read: () => number } {
    let rows = 0;
    const wrapped = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async (st: Parameters<typeof db.batch>[0]) => {
        const out = await db.batch(st);
        for (const r of out) rows += Number((r.meta as { rows_read?: number }).rows_read ?? 0);
        return out;
      },
    };
    return { env: adminEnv({ DB: wrapped }), read: () => rows };
  }

  it('the newest `limit` entries, no check (chain null), the total from the ids, and only those rows read', async () => {
    const { sealedBatch } = await import('../auditlog.ts');
    const { realEnv, withoutLogTriggers } = await import('./helpers.ts');
    for (let i = 0; i < 300; i++) await sealedBatch(realEnv, db, { ts: i, who: 'w'.repeat(22), action: 'pub.hide', target: `t${i}`, note: '' }, (e) => [e]);
    // A broken chain is not looked at here.
    await withoutLogTriggers(async () => {
      await db.prepare("UPDATE admin_log SET note = 'x' WHERE target = 't299'").run();
    });
    const c = counting();
    const p = await adminJson<AdminLogPage>('/api/admin/log?chain=0&limit=20', { env: c.env });
    expect(p.chain).toBeNull();
    expect(p.total).toBe(300);
    expect(p.entries.map((e) => e.target)).toEqual(Array.from({ length: 20 }, (_, i) => `t${299 - i}`));
    expect(p.next).toBe(p.entries[19]?.id);
    expect(c.read()).toBeLessThanOrEqual(25);
    const older = await adminJson<AdminLogPage>(`/api/admin/log?chain=0&limit=20&before=${p.next}`);
    expect(older.entries[0]?.target).toBe('t279');
    // The Log view's read checks every row.
    const full = counting();
    expect((await adminJson<AdminLogPage>('/api/admin/log', { env: full.env })).chain).toMatchObject({ state: 'broken', brokenCount: 1 });
    expect(full.read()).toBeGreaterThanOrEqual(300);
  });

  it('an empty log: total 0; bad parameters are 400', async () => {
    expect(await adminJson<AdminLogPage>('/api/admin/log?chain=0&limit=5')).toEqual({ entries: [], next: null, total: 0, chain: null });
    for (const bad of ['?chain=2', '?chain=0&limit=0', '?chain=0&limit=101', '?chain=0&limit=x', '?chain=0&kind=flags', '?chain=0&q=a', '?limit=20']) {
      expect((await admin(`/api/admin/log${bad}`)).status, bad).toBe(400);
    }
  });
});

describe('GET /api/admin/graphs', () => {
  it('every series for a range: online by bucket, the days rolled up and today live, splits, storage, the largest, sharing', async () => {
    const yesterday = NOW - DAY_MS;
    const a = device();
    await recordBeat(db, { device: a, version: '0.14.0', type: 'desktop', browser: 'firefox', state: 'playing' }, yesterday);
    const alice = await signUp('alice');
    await list(alice);
    await db.prepare('UPDATE account SET item_bytes = 700').run();
    await rollUp(db, new Date(yesterday).toISOString().slice(0, 10));
    await recordBeat(db, { device: device(), version: '0.14.0', type: 'phone', browser: 'safari', state: 'menu' }, NOW);
    // Samples: two in one 30-minute bucket, one in another.
    await db.batch([
      db.prepare('INSERT INTO stat_sample (ts, online, playing) VALUES (?1, 3, 1), (?2, 5, 2), (?3, 1, 0)').bind(NOW - 3 * 3_600_000, NOW - 3 * 3_600_000 + 300_000, NOW - 600_000),
    ]);

    const g = await adminJson<AdminGraphs>('/api/admin/graphs?range=7d');
    expect(g).toMatchObject({ range: '7d', now: NOW, bucketMinutes: 30 });
    expect(g.online.map((p) => [p.online, p.playing])).toEqual([
      [5, 2],
      [1, 0],
    ]);
    const today = g.days.at(-1);
    expect(today).toMatchObject({ day: '2026-11-15', final: false, m: { devices: 1, new_accounts: 1, pubs_new: 1, listed_new: 1, accounts: 1, item_bytes: 700, pub_bytes: 100, devices_7d: 2 } });
    const before = g.days.find((d) => d.day === '2026-11-14');
    expect(before).toMatchObject({ final: true, m: { devices: 1, devices_7d: 1, devices_30d: 1, new_accounts: 0, peak_online: 0 } });
    expect(g.split).toEqual({ type: { desktop: 1, phone: 1 }, browser: { firefox: 1, safari: 1 }, version: { '0.14.0': 2 } });
    expect(g.storage).toEqual({ accounts: 1, itemBytes: 700, runBytes: 0, pubBytes: 100 });
    expect(g.largest).toEqual([{ name: 'alice', itemBytes: 700, runBytes: 0, pubBytes: 100 }]);
    expect(g.sharing).toEqual({ pubs: 1, listed: 1, hidden: 0, votes: 0, comments: 0, notes: 0, openReports: 0 });

    expect((await adminJson<AdminGraphs>('/api/admin/graphs')).range).toBe('30d');
    const day = await adminJson<AdminGraphs>('/api/admin/graphs?range=24h');
    expect(day.bucketMinutes).toBe(5);
    expect(day.online).toHaveLength(3);
    expect(day.days.map((d) => d.day)).toEqual(['2026-11-14', '2026-11-15']);
    const all = await adminJson<AdminGraphs>('/api/admin/graphs?range=all');
    expect(all.bucketMinutes).toBe(1440);
    expect(all.online.map((p) => [new Date(p.ts).toISOString().slice(0, 10), p.online])).toEqual([
      ['2026-11-14', 0],
      ['2026-11-15', 5],
    ]);
    expect((await admin('/api/admin/graphs?range=1y')).status).toBe(400);
  });

  it('the backfill of migration 0007 makes the new metrics of past days from the tables', async () => {
    const sql = (Object.values(import.meta.glob('../migrations/0007_admin_panel.sql', { query: '?raw', import: 'default', eager: true }))[0] ?? '') as string;
    const backfill = sql
      .split(';')
      .filter((s) => s.includes('INSERT OR IGNORE INTO stat_daily'))
      .map((s) => s.slice(s.indexOf('INSERT OR IGNORE INTO stat_daily')));
    expect(backfill).toHaveLength(10);
    const d1 = Date.parse('2026-10-01T10:00:00Z');
    await db.batch([
      db.prepare("INSERT INTO device_day (day, device) VALUES ('2026-09-28', 'x'), ('2026-10-01', 'x'), ('2026-10-01', 'y'), ('2026-10-02', 'z')"),
      db.prepare("INSERT INTO account (id, name, name_key, created, last_seen, salt, kdf, auth_hash, recovery_hash, wrap_pw, wrap_rc) VALUES ('a1', 'a1', 'a1', ?1, ?1, 's', '{}', 'h', 'r', 'w', 'w')").bind(d1),
      db.prepare("INSERT INTO publication (id, account, state, created, updated, listed, listed_at) VALUES ('p1', 'a1', 'active', ?1, ?1, 1, ?1), ('p2', 'a1', 'removed', ?1, ?1, 0, NULL), ('p3', 'a1', 'pending', ?1, ?1, 0, NULL)").bind(d1),
      db.prepare("INSERT INTO vote (publication, account, stars, created, updated) VALUES ('p1', 'a2', 3, ?1, ?1)").bind(d1),
      db.prepare("INSERT INTO comment (id, publication, account, text, created) VALUES ('c1', 'p1', 'a2', 'x', ?1)").bind(d1),
      db.prepare("INSERT INTO note (id, account, text, created) VALUES ('n1', 'a2', 'x', ?1)").bind(d1),
      db.prepare("INSERT INTO report (kind, target, account, reason, created) VALUES ('run', 'p1', 'a2', 'rules', ?1)").bind(d1),
      db.prepare("INSERT INTO pub_view (pub, device, day) VALUES ('p1', 'x', '2026-10-01')"),
    ]);
    await db.batch(backfill.map((s) => db.prepare(s)));
    const rows = (await db.prepare("SELECT metric, value FROM stat_daily WHERE day = '2026-10-01' ORDER BY metric").all<{ metric: string; value: number }>()).results;
    expect(Object.fromEntries(rows.map((r) => [r.metric, r.value]))).toEqual({
      comments: 1,
      devices_30d: 2,
      devices_7d: 2,
      listed_new: 1,
      new_accounts: 1,
      notes: 1,
      pubs_new: 2,
      reports: 1,
      views: 1,
      votes: 1,
    });
    expect((await db.prepare("SELECT value FROM stat_daily WHERE day = '2026-10-02' AND metric = 'devices_7d'").first())).toEqual({ value: 3 });
  });
});

// Vite's import.meta.glob, which the worker's tsconfig has no types for (vite/client).
declare global {
  interface ImportMeta {
    glob(pattern: string | string[], options: { query: string; import: string; eager: true }): Record<string, unknown>;
  }
}

export { adminEnv };
