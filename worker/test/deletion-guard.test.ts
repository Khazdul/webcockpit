// Stage 66 (ADR 0157 "Deleting an account removes everything"): an account
// with every kind of row is deleted by the admin; then every table of the
// database (read from sqlite_master, so a new table is in it by itself) is
// searched for the account's id, its name and the ids of its things, and
// R2 for its objects. What stays on purpose is named here, with why.
import { beforeEach, describe, expect, it } from 'vitest';
import { toB64url } from '../bytes.ts';
import { bucket, db, device, emptyTables, r2Keys } from './helpers.ts';
import { admin, forgetAccessKeys } from './access-helpers.ts';
import { CENV, ccall, commented, list, noted, voted } from './community-helpers.ts';
import { AUTH_KEY, NOW, call, envOf, payload, publish, reportOf, signUp } from './share-helpers.ts';

/**
 * Every column that holds an account id, and how deletion handles it. A
 * new table (or column) named like one fails the first test until it is
 * added here and handled in worker/deletion.ts.
 */
const ACCOUNT_COLUMNS: Record<string, string> = {
  'account.id': 'the row is deleted',
  'item.account': 'deleted',
  'run_body.account': 'deleted (the R2 prefix emptied, r2_sweep for the cron)',
  'session.account': 'deleted (ended with the reason `deleted`)',
  'session_end.account': 'set to \'\' (the reason stays for the cookies still out there)',
  'publication.account': 'kept on tombstones only (no text; the cron sweeps their R2 objects)',
  'report.account': 'open ones deleted, handled ones kept with account NULL and no text',
  'vote.account': 'deleted (out of the sums)',
  'comment.account': 'deleted (counts adjusted)',
  'note.account': 'deleted',
};

/** A column whose name says it may hold an account id. */
const ACCOUNTISH = /^(account|account_id|owner|user|user_id|writer|sender|reporter|author|by_account)$/i;

const RUNS_ENV = envOf({ FLAG_GALLERY: true, FLAG_RUNES: true, FLAG_RUNS: true });

beforeEach(async () => {
  await emptyTables();
  forgetAccessKeys();
});

async function tables(): Promise<{ table: string; columns: string[] }[]> {
  const { results } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")
    .all<{ name: string }>();
  const out: { table: string; columns: string[] }[] = [];
  for (const { name } of results) {
    const cols = await db.prepare('SELECT name FROM pragma_table_info(?1)').bind(name).all<{ name: string }>();
    out.push({ table: name, columns: cols.results.map((c) => c.name) });
  }
  return out;
}

/** Every (table.column, row) whose text holds `needle` (case-insensitive). */
async function holding(needle: string): Promise<{ where: string; row: Record<string, unknown> }[]> {
  const out: { where: string; row: Record<string, unknown> }[] = [];
  for (const { table, columns } of await tables()) {
    for (const col of columns) {
      const { results } = await db
        .prepare(`SELECT * FROM "${table}" WHERE instr(lower(CAST("${col}" AS TEXT)), lower(?1)) > 0`)
        .bind(needle)
        .all<Record<string, unknown>>();
      for (const row of results) out.push({ where: `${table}.${col}`, row });
    }
  }
  return out;
}

const cookieOf = (res: Response): string => (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

describe('deleting an account removes everything (stage 66)', () => {
  it('every column that may hold an account id is one deletion handles', async () => {
    const found: string[] = [];
    for (const { table, columns } of await tables()) for (const c of columns) if (ACCOUNTISH.test(c)) found.push(`${table}.${c}`);
    found.push('account.id');
    expect(found.sort()).toEqual(Object.keys(ACCOUNT_COLUMNS).sort());
  });

  it('an account with every kind of row, deleted by the admin: nothing of it is left in D1 or R2 but the named', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const aliceId = ((await db.prepare("SELECT id FROM account WHERE name_key = 'alice'").first<{ id: string }>()) as { id: string }).id;

    // Small items and run bodies.
    const itemId = toB64url(Uint8Array.from({ length: 16 }, (_, i) => i + 1));
    const runId = toB64url(Uint8Array.from({ length: 16 }, (_, i) => i + 40));
    expect((await call('PUT', `/api/u/sync/items/profile/${itemId}`, undefined, { cookie: alice, env: RUNS_ENV, headers: { 'content-type': 'application/octet-stream', 'if-match': '0' }, body: new Uint8Array([1, 2, 3]) })).status).toBe(200);
    const body = new Uint8Array(300).fill(7);
    expect((await call('PUT', `/api/u/runs/${runId}`, undefined, { cookie: alice, env: RUNS_ENV, headers: { 'content-type': 'application/octet-stream', 'content-length': '300' }, body })).status).toBe(200);
    expect(await r2Keys(`u/${aliceId}/`)).toHaveLength(1);

    // Published runs: listed and link only, with payloads in R2; a pending one (an upload in flight).
    const listed = await list(alice, { seed: 3 });
    const link = await publish(alice, payload(80, 5), undefined, { env: CENV });
    const pending = 'Pend1ngRun00';
    await db
      .prepare("INSERT INTO publication (id, account, title, state, created, updated, bytes) VALUES (?1, ?2, 'in flight', 'pending', ?3, ?3, 10)")
      .bind(pending, aliceId, NOW)
      .run();
    // Bob's run, which alice votes on, comments on and reports.
    const bobs = await list(bob, { seed: 9 });
    await voted(alice, bobs, 4);
    const aliceComment = await commented(alice, bobs, 'Alice was here.');
    const aliceCommentOnOwn = await commented(alice, listed, 'My own run.');
    const aliceNote = await noted(alice, 'A note by alice.');
    // Bob on alice's things: a vote, a comment, reports (received).
    await voted(bob, listed, 2);
    const bobComment = await commented(bob, listed, 'Bob on alice’s run.');
    expect((await reportOf(bob, listed, { text: 'about alice run' }, { env: CENV })).status).toBe(204);
    expect((await ccall('POST', '/api/u/report', { kind: 'comment', target: aliceComment, reason: 'harassment', text: 'about alice comment' }, { cookie: bob })).status).toBe(204);
    expect((await ccall('POST', '/api/u/report', { kind: 'note', target: aliceNote, reason: 'harassment' }, { cookie: bob })).status).toBe(204);
    // Reports made by alice: one open, one handled by the admin.
    expect((await reportOf(alice, bobs, { text: 'alice reports bob' }, { env: CENV })).status).toBe(204);
    expect((await ccall('POST', '/api/u/report', { kind: 'comment', target: bobComment, reason: 'harassment', text: 'alice on bob comment' }, { cookie: alice })).status).toBe(204);
    expect((await admin(`/api/admin/comment/${bobComment}`, { body: { action: 'dismiss' } })).status).toBe(204);
    // Views of her run.
    expect((await call('POST', `/api/pub/${listed}/view`, { device: device() }, { env: CENV, headers: { 'content-type': 'application/json' } })).status).toBe(204);
    // Sessions: a live one more, and one ended (logged out).
    const login = await call('POST', '/api/auth/login', { name: 'alice', authKey: AUTH_KEY, label: 'Phone' });
    expect(login.status).toBe(200);
    expect((await call('POST', '/api/u/auth/logout', undefined, { cookie: cookieOf(login) })).status).toBe(204);
    // Limits of her own, and an admin action on her (logged by name).
    expect((await admin('/api/admin/account/alice/limits', { method: 'PUT', body: { limits: { items: 10 } } })).status).toBe(200);

    // Every kind of row is there before.
    const before = await holding(aliceId);
    const kinds = new Set(before.map((h) => h.where));
    for (const w of ['account.id', 'item.account', 'run_body.account', 'session.account', 'session_end.account', 'publication.account', 'report.account', 'vote.account', 'comment.account', 'note.account']) {
      expect(kinds, w).toContain(w);
    }
    const pubKeys = [listed, link].map((id) => `pub/${id}`);
    for (const k of pubKeys) expect(await bucket.head(k), k).not.toBeNull();

    // The admin deletes the account.
    expect((await admin('/api/admin/account/alice', { body: { action: 'delete', confirm: 'alice', note: 'test' } })).status).toBe(204);

    // R2: nothing under u/<id>/, no payload of its runs.
    expect(await r2Keys(`u/${aliceId}/`)).toEqual([]);
    for (const k of pubKeys) expect(await bucket.head(k), k).toBeNull();

    // D1: the account's id only where named.
    const left = await holding(aliceId);
    for (const h of left) {
      if (h.where === 'publication.account') {
        // A tombstone: no title, description or character; not listed; no payload bytes left (or the pending one's, for the cron).
        expect(h.row, `tombstone ${String(h.row.id)}`).toMatchObject({ state: 'removed', title: '', description: '', character: '', listed: 0 });
        continue;
      }
      if (h.where === 'r2_sweep.prefix') {
        expect(h.row.prefix).toBe(`u/${aliceId}/`);
        continue;
      }
      throw new Error(`left behind: ${h.where} ${JSON.stringify(h.row)}`);
    }
    expect(left.filter((h) => h.where === 'publication.account').map((h) => h.row.id).sort()).toEqual([listed, link, pending].sort());

    // Its name: reserved, and in the admin's log (the entries about it).
    for (const h of await holding('alice')) {
      // Text that only mentions the word (bob's report text, comment text) is bob's, not alice's.
      if (h.where === 'reserved_name.name_key' || h.where === 'admin_log.target') continue;
      if (h.where === 'report.text' && h.row.account !== null) continue;
      if (h.where === 'comment.text' && h.row.account !== aliceId) continue;
      throw new Error(`name left behind: ${h.where} ${JSON.stringify(h.row)}`);
    }
    expect((await db.prepare("SELECT action FROM admin_log WHERE target = 'alice' ORDER BY id").all()).results).toEqual([{ action: 'account.limits' }, { action: 'account.delete' }]);

    // The ids of its comments and note, and of its runs: only in tombstones and handled reports.
    for (const id of [aliceComment, aliceCommentOnOwn, aliceNote, bobComment, listed, link, pending]) {
      for (const h of await holding(id)) {
        if (h.where === 'publication.id' && h.row.state === 'removed') continue;
        if (h.where === 'report.target' && typeof h.row.handled === 'number' && h.row.handled > 0) continue;
        if (h.where === 'admin_log.target') continue;
        // Bob's comment on another run is bob's (its row stays only when not on alice's runs).
        throw new Error(`${id} left behind: ${h.where} ${JSON.stringify(h.row)}`);
      }
    }
    // Reports she made: the open one gone, the handled one kept without text or reporter.
    const handled = (await db.prepare("SELECT account, text, target FROM report WHERE kind = 'comment' AND target = ?1").bind(bobComment).all()).results;
    expect(handled).toEqual([{ account: null, text: '', target: bobComment }]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM report WHERE text LIKE 'alice%'").first<{ n: number }>())?.n).toBe(0);
    // Reports received: handled.
    expect((await db.prepare('SELECT COUNT(*) AS n FROM report WHERE handled = 0').first<{ n: number }>())?.n).toBe(0);
    // Bob's own things stay.
    expect((await db.prepare("SELECT state FROM publication WHERE id = ?1").bind(bobs).first())).toEqual({ state: 'active' });
    // Her sessions' reasons remain for their cookies, without her id.
    expect((await db.prepare("SELECT reason FROM session_end WHERE account = '' ORDER BY reason").all()).results).toEqual([{ reason: 'deleted' }, { reason: 'logout' }]);
  });
});
