// Stage 64's review fixes on the Worker's share paths (ADR 0154 "As built
// (stage 64, review fixes)"): one describe per finding. The admin's side
// (S3's Restore and Dismiss, CR5, CR6, the queue's hidden reason) is in
// admin.test.ts, which has the Access harness.
import { beforeEach, describe, expect, it } from 'vitest';
import type { MyPub, PubWritten } from '../../shared/cloud/api.ts';
import { PENDING_STALE_MS } from '../pub.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import { bucket, db, device, emptyTables, r2Keys } from './helpers.ts';
import { AUTH_KEY, ENV, META, NOW, ORIGIN, accountRow, call, ok, payload, post, pubRow, publish, reportOf, oldSignUp, signUp } from './share-helpers.ts';

beforeEach(async () => {
  await emptyTables();
});

const deleteAccount = (cookie: string): Promise<Response> => call('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie });

describe('S3: the five that hide count only reporters that still exist and are not suspended', () => {
  it('reports of deleted accounts do not count towards the five', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    for (let i = 0; i < 4; i++) {
      const c = await oldSignUp(`gone${i}`, { rules: false });
      expect((await reportOf(c, id)).status).toBe(204);
      expect((await deleteAccount(c)).status).toBe(204);
    }
    expect((await reportOf(await signUp('last', { rules: false }), id)).status).toBe(204);
    expect((await pubRow(id))?.state).toBe('active');
  });

  it('reports of suspended accounts do not count towards the five', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    for (let i = 0; i < 4; i++) {
      const c = await oldSignUp(`sock${i}`, { rules: false });
      expect((await reportOf(c, id)).status).toBe(204);
      await db.prepare("UPDATE account SET state = 'suspended' WHERE name_key = ?1").bind(`sock${i}`).run();
    }
    expect((await reportOf(await oldSignUp('last', { rules: false }), id)).status).toBe(204);
    expect((await pubRow(id))?.state).toBe('active');
    // Five that are all still there and active do hide it.
    for (let i = 0; i < 4; i++) expect((await reportOf(await oldSignUp(`real${i}`, { rules: false }), id)).status).toBe(204);
    expect(await pubRow(id)).toMatchObject({ state: 'hidden', hidden_reason: 'reports' });
  });

  it('a run marked reviewed is never hidden by reports (they still queue)', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    await db.prepare('UPDATE publication SET reviewed = 1 WHERE id = ?1').bind(id).run();
    for (let i = 0; i < 6; i++) expect((await reportOf(await oldSignUp(`sock${i}`, { rules: false }), id)).status).toBe(204);
    expect((await pubRow(id))?.state).toBe('active');
    expect((await db.prepare('SELECT COUNT(*) AS n FROM report WHERE handled = 0 AND target = ?1').bind(id).first<{ n: number }>())?.n).toBe(6);
  });
});

describe('S4: Delete account takes its reports with it', () => {
  it('unhandled reports are deleted, handled ones lose their text and account', async () => {
    const alice = await signUp('alice');
    const a = await publish(alice);
    const b = await publish(alice);
    const carol = await signUp('carol', { rules: false });
    const { id: carolId } = await accountRow('carol');
    expect((await reportOf(carol, a, { text: 'secret note one' })).status).toBe(204);
    expect((await reportOf(carol, b, { text: 'secret note two' })).status).toBe(204);
    await db.prepare('UPDATE report SET handled = ?2 WHERE target = ?1').bind(b, NOW).run();
    expect((await deleteAccount(carol)).status).toBe(204);
    const rows = (await db.prepare('SELECT target, account, text, handled FROM report ORDER BY target').all()).results;
    expect(rows).toEqual([{ target: b, account: null, text: '', handled: NOW }]);
    expect(JSON.stringify(rows)).not.toContain(carolId);
  });
});

describe('S5: a view is counted only from the site itself', () => {
  const at = (id: string, headers: Record<string, string>, dev = device()): Promise<Response> =>
    call('POST', `/api/pub/${id}/view`, undefined, { csrf: false, headers, body: JSON.stringify({ device: dev }) });

  it('refuses a simple cross-site POST (text/plain, a foreign Origin, no X-WC)', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const refused: Record<string, string>[] = [
      { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://evil.example' },
      { 'content-type': 'text/plain;charset=UTF-8', origin: ORIGIN, 'x-wc': '1' },
      { 'content-type': 'application/json', origin: 'https://evil.example', 'x-wc': '1' },
      { 'content-type': 'application/json', origin: ORIGIN },
      { 'content-type': 'application/json', 'x-wc': '1' },
    ];
    for (const h of refused) expect((await at(id, h)).status, JSON.stringify(h)).toBe(403);
    expect((await pubRow(id))?.views).toBe(0);
    expect((await at(id, { 'content-type': 'application/json', origin: ORIGIN, 'x-wc': '1' })).status).toBe(204);
    expect((await pubRow(id))?.views).toBe(1);
  });
});

describe('S7: the sender cannot retitle a hidden run', () => {
  it('PATCH of a hidden run is 403 hidden and changes nothing', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    await db.prepare("UPDATE publication SET state = 'hidden', hidden_reason = 'reports' WHERE id = ?1").bind(id).run();
    const res = await call('PATCH', `/api/u/pub/${id}`, { title: 'Harmless' }, { cookie: alice });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'hidden' });
    expect((await pubRow(id))?.title).toBe(META.title);
  });
});

describe('CR3: an idempotency key answers a repeated POST with the run it made', () => {
  const KEY = 'k3y_0f-the-dialog-123';

  it('the same key twice: one run, the same answer, one count', async () => {
    const alice = await signUp('alice');
    const first = await ok<PubWritten>(await post(alice, { ...META, key: KEY }));
    const again = await ok<PubWritten>(await post(alice, { ...META, key: KEY }));
    expect(again.pub).toEqual(first.pub);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 1 });
    expect(await r2Keys()).toEqual([`pub/${first.pub.id}`]);
    // Another key is another run; the key is per account.
    const other = await ok<PubWritten>(await post(alice, { ...META, key: `${KEY}x` }));
    expect(other.pub.id).not.toBe(first.pub.id);
    const bob = await signUp('bob');
    expect((await ok<PubWritten>(await post(bob, { ...META, key: KEY }))).pub.id).not.toBe(first.pub.id);
  });

  it('a repeated key at the limit still answers its run, not pub_quota', async () => {
    const alice = await signUp('alice');
    await db.prepare('UPDATE account SET limits = ?2 WHERE name_key = ?1').bind('alice', JSON.stringify({ sharedRuns: 1 })).run();
    const first = await ok<PubWritten>(await post(alice, { ...META, key: KEY }));
    expect((await ok<PubWritten>(await post(alice, { ...META, key: KEY }))).pub.id).toBe(first.pub.id);
    expect((await post(alice, { ...META, key: 'another-key-of-16' })).status).toBe(413);
  });

  it('a removed run’s key makes a new run; a key that is not 16–32 of [A-Za-z0-9_-] is 400', async () => {
    const alice = await signUp('alice');
    const first = await ok<PubWritten>(await post(alice, { ...META, key: KEY }));
    expect((await call('DELETE', `/api/u/pub/${first.pub.id}`, undefined, { cookie: alice })).status).toBe(204);
    const next = await ok<PubWritten>(await post(alice, { ...META, key: KEY }));
    expect(next.pub.id).not.toBe(first.pub.id);
    for (const key of ['short', 'x'.repeat(33), 'has space in it ok', 'ünïcode-key-12345', 12345678901234567]) {
      expect((await post(alice, { ...META, key })).status, String(key)).toBe(400);
    }
  });
});

describe('CR4: lengthS is a whole number of seconds', () => {
  it('a fraction or a negative is 400; a whole number passes', async () => {
    const alice = await signUp('alice');
    for (const lengthS of [93.5, -1, 0.1]) expect((await post(alice, { ...META, lengthS })).status, String(lengthS)).toBe(400);
    const made = await ok<{ pub: MyPub }>(await post(alice, { ...META, lengthS: 93 }));
    expect(made.pub.lengthS).toBe(93);
  });
});

describe('CR7: Delete account during an upload leaves no object in R2 for ever', () => {
  it('a pending upload’s object that lands after Delete account is deleted by the cron', async () => {
    const alice = await signUp('alice');
    const { id: account } = await accountRow('alice');
    // Step 1 of a POST: the pending row and the count.
    await db.batch([
      db.prepare(`INSERT INTO publication (id, account, title, bytes, state, created, updated) VALUES ('PPPPPPPPPPPP', ?1, 't', 40, 'pending', ?2, ?2)`).bind(account, NOW),
      db.prepare('UPDATE account SET pub_count = 1, pub_bytes = 40 WHERE id = ?1').bind(account),
    ]);
    expect((await deleteAccount(alice)).status).toBe(204);
    // Step 2's put lands after the deletion, and the isolate dies before step 3.
    await bucket.put('pub/PPPPPPPPPPPP', payload(40));
    await runCron(ENV, DAILY_CRON, NOW + PENDING_STALE_MS + 1);
    expect(await r2Keys('pub/')).toEqual([]);
    expect(await pubRow('PPPPPPPPPPPP')).toMatchObject({ state: 'removed', bytes: 0 });
  });

  it('the cron leaves a fresh tombstone of a pending upload to its upload (no early bytes = 0)', async () => {
    const alice = await signUp('alice');
    const { id: account } = await accountRow('alice');
    await db.prepare(`INSERT INTO publication (id, account, title, bytes, state, created, updated) VALUES ('QQQQQQQQQQQQ', ?1, 't', 40, 'pending', ?2, ?2)`).bind(account, NOW).run();
    expect((await deleteAccount(alice)).status).toBe(204);
    await runCron(ENV, DAILY_CRON, NOW + 60_000);
    expect(await pubRow('QQQQQQQQQQQQ')).toMatchObject({ state: 'removed', bytes: 40 });
  });
});

describe('CR10: the cron gives back many pending rows at once', () => {
  it('every stale pending row of several accounts becomes a tombstone with its count back', async () => {
    const ids: string[] = [];
    for (const name of ['alice', 'bob']) {
      await signUp(name);
      const { id: account } = await accountRow(name);
      for (let i = 0; i < 3; i++) {
        const id = `${name === 'alice' ? 'A' : 'B'}${String(i).repeat(11)}`;
        ids.push(id);
        await db.prepare(`INSERT INTO publication (id, account, title, bytes, state, created, updated) VALUES (?1, ?2, 't', 10, 'pending', ?3, ?3)`).bind(id, account, NOW).run();
      }
      await db.prepare('UPDATE account SET pub_count = 3, pub_bytes = 30 WHERE id = ?1').bind(account).run();
    }
    await runCron(ENV, DAILY_CRON, NOW + PENDING_STALE_MS);
    for (const id of ids) expect((await pubRow(id))?.state).toBe('removed');
    for (const name of ['alice', 'bob']) expect(await accountRow(name)).toMatchObject({ pub_count: 0, pub_bytes: 0 });
  });
});
