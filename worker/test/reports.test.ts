// Reports (worker/reports.ts; `ReportRequest` in shared/cloud/api.ts,
// ADR 0154), in workerd with a local D1 and R2, the flag `share` on.
import { beforeEach, describe, expect, it } from 'vitest';
import { REPORTS_PER_DAY } from '../../shared/cloud/api.ts';
import { count, db, emptyTables } from './helpers.ts';
import { DAY, NOW, call, pubRow, publish, reportOf, oldSignUp, signUp } from './share-helpers.ts';

beforeEach(async () => {
  await emptyTables();
});

async function reporters(n: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(await oldSignUp(`reporter${i}`, { rules: false }));
  return out;
}

describe('POST /api/u/report', () => {
  it('stores one report (204) with its reason and text; a second from the account is 409', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob', { rules: false });
    const id = await publish(alice);
    const res = await reportOf(bob, id, { reason: 'real_life', text: 'Names a\nreal person.' });
    expect(res.status).toBe(204);
    const row = await db.prepare('SELECT kind, target, reason, text, created, handled FROM report').first();
    expect(row).toEqual({ kind: 'run', target: id, reason: 'real_life', text: 'Names a\nreal person.', created: NOW, handled: 0 });
    const again = await reportOf(bob, id, { reason: 'other' });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_reported' });
    expect(await count('report')).toBe(1);
  });

  it('one’s own run is 403 own; an unknown, malformed or removed run 404; a hidden one can still be reported', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await publish(alice);
    const own = await reportOf(alice, id);
    expect(own.status).toBe(403);
    expect(await own.json()).toEqual({ error: 'own' });
    expect((await reportOf(bob, 'AAAAAAAAAAAA')).status).toBe(404);
    expect((await reportOf(bob, 'short')).status).toBe(404);
    const gone = await publish(alice);
    await call('DELETE', `/api/u/pub/${gone}`, undefined, { cookie: alice });
    expect((await reportOf(bob, gone)).status).toBe(404);
    await db.prepare("UPDATE publication SET state = 'hidden', hidden_reason = 'admin' WHERE id = ?1").bind(id).run();
    expect((await reportOf(bob, id)).status).toBe(204);
  });

  it('400 for a bad body; the kinds of stage 65 are closed (400 kind_closed)', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await publish(alice);
    for (const extra of [
      { reason: 'spam' },
      { kind: 'video' },
      { text: 'x'.repeat(501) },
      { text: 'bell\u0007' },
      { text: 5 },
      { target: 5 },
      { more: 1 },
    ]) {
      expect((await reportOf(bob, id, extra)).status, JSON.stringify(extra)).toBe(400);
    }
    const closed = await reportOf(bob, id, { kind: 'comment' });
    expect(closed.status).toBe(400);
    expect(await closed.json()).toEqual({ error: 'kind_closed' });
    expect((await call('POST', '/api/u/report', 'not json', { cookie: bob })).status).toBe(400);
    expect((await call('POST', '/api/u/report', { kind: 'run', target: id, reason: 'rules' }, { cookie: bob, csrf: false })).status).toBe(403);
    expect((await call('POST', '/api/u/report', { kind: 'run', target: id, reason: 'rules' })).status).toBe(401);
    expect(await count('report')).toBe(0);
  });

  it('a suspended account cannot report (403 suspended)', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await publish(alice);
    await db.prepare("UPDATE account SET state = 'suspended' WHERE name_key = 'bob'").run();
    const res = await reportOf(bob, id);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'suspended' });
  });

  it(`${REPORTS_PER_DAY} a UTC day per account (429 too_many), also in parallel; the next day again`, async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await db.prepare("UPDATE account SET limits = '{\"sharedRuns\": 1000}' WHERE name_key = 'alice'").run();
    const ids: string[] = [];
    for (let i = 0; i < REPORTS_PER_DAY + 6; i++) ids.push(await publish(alice));
    for (const id of ids.slice(0, REPORTS_PER_DAY - 2)) expect((await reportOf(bob, id)).status).toBe(204);
    // Five at once for the last two places.
    const answers = await Promise.all(ids.slice(REPORTS_PER_DAY - 2, REPORTS_PER_DAY + 3).map((id) => reportOf(bob, id)));
    expect(answers.map((r) => r.status).sort()).toEqual([204, 204, 429, 429, 429]);
    const over = await reportOf(bob, ids[REPORTS_PER_DAY + 4] as string);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: 'too_many' });
    expect(await count('report')).toBe(REPORTS_PER_DAY);
    // A new UTC day.
    expect((await reportOf(bob, ids[REPORTS_PER_DAY + 4] as string, {}, { now: NOW + DAY })).status).toBe(204);
  });

  it('five different accounts’ open reports hide the run (451), four do not; handled ones do not count', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const r = await reporters(6);
    for (const cookie of r.slice(0, 4)) expect((await reportOf(cookie, id)).status).toBe(204);
    expect((await pubRow(id))?.state).toBe('active');
    expect((await call('GET', `/api/pub/${id}`)).status).toBe(200);
    expect((await reportOf(r[4] as string, id, {}, { now: NOW + 1 })).status).toBe(204);
    expect(await pubRow(id)).toMatchObject({ state: 'hidden', hidden_reason: 'reports', updated: NOW + 1 });
    expect((await call('GET', `/api/pub/${id}`)).status).toBe(451);
    // The sender sees it as hidden in the list.
    const { pubs } = (await (await call('GET', '/api/u/pub', undefined, { cookie: alice })).json()) as { pubs: { state: string }[] };
    expect(pubs[0]?.state).toBe('hidden');

    // Restored with the reports handled: one more report does not hide it again.
    await db.batch([db.prepare("UPDATE publication SET state = 'active', hidden_reason = NULL"), db.prepare('UPDATE report SET handled = 1')]);
    expect((await reportOf(r[5] as string, id)).status).toBe(204);
    expect((await pubRow(id))?.state).toBe('active');
  });

  it('five parallel reports from five accounts hide the run', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const r = await reporters(5);
    const answers = await Promise.all(r.map((cookie) => reportOf(cookie, id)));
    expect(answers.map((a) => a.status)).toEqual([204, 204, 204, 204, 204]);
    expect((await pubRow(id))?.state).toBe('hidden');
  });
});
