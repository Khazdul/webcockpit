// Votes (stage 65, ADR 0155 "Votes and why Top is not cheap to move"):
// the endpoints, the two sums under parallel votes, the 7-day rule, the
// hourly limit held in the statement, and suspension, Restore, deletion
// and a removed run moving the sums.
import { beforeEach, describe, expect, it } from 'vitest';
import type { VoteAnswer } from '../../shared/cloud/api.ts';
import { count, db, emptyTables } from './helpers.ts';
import { AUTH_KEY, accountRow, setLimits, signUp } from './share-helpers.ts';
import { DAY, NOW, ageAccount, ccall, cenvOf, expectSums, list, ok, vote, voted } from './community-helpers.ts';
import { adminCall } from './admin-call.ts';

beforeEach(async () => {
  await emptyTables();
});

const admin = (path: string, body: unknown): Promise<Response> => adminCall(path, body);

describe('votes', () => {
  it('PUT, GET and DELETE a vote; the answer is the new stars and one’s own', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    expect(await ok<VoteAnswer>(await ccall('GET', `/api/u/pub/${id}/vote`, undefined, { cookie: bob }))).toEqual({ stars: { sum: 0, count: 0 }, mine: null });
    expect(await voted(bob, id, 4)).toEqual({ stars: { sum: 4, count: 1 }, mine: 4 });
    expect(await voted(bob, id, 2)).toEqual({ stars: { sum: 2, count: 1 }, mine: 2 });
    expect(await ok<VoteAnswer>(await ccall('GET', `/api/u/pub/${id}/vote`, undefined, { cookie: bob }))).toEqual({ stars: { sum: 2, count: 1 }, mine: 2 });
    expect(await ok<VoteAnswer>(await ccall('DELETE', `/api/u/pub/${id}/vote`, undefined, { cookie: bob }))).toEqual({ stars: { sum: 0, count: 0 }, mine: null });
    // Again: nothing to take back.
    expect(await ok<VoteAnswer>(await ccall('DELETE', `/api/u/pub/${id}/vote`, undefined, { cookie: bob }))).toEqual({ stars: { sum: 0, count: 0 }, mine: null });
    await expectSums(id);
  });

  it('refuses one’s own run, bad stars, an unknown or hidden run, a suspended account, and the flag off', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    const own = await vote(alice, id, 5);
    expect(own.status).toBe(403);
    expect(await own.json()).toEqual({ error: 'own' });
    for (const stars of [0, 6, 2.5, '3', null]) expect((await ccall('PUT', `/api/u/pub/${id}/vote`, { stars }, { cookie: bob })).status, String(stars)).toBe(400);
    expect((await ccall('PUT', `/api/u/pub/${id}/vote`, { stars: 3, more: 1 }, { cookie: bob })).status).toBe(400);
    expect((await vote(bob, 'AAAAAAAAAAAA', 3)).status).toBe(404);
    expect((await vote(bob, 'bad', 3)).status).toBe(404);
    await db.prepare("UPDATE publication SET state = 'hidden' WHERE id = ?1").bind(id).run();
    expect((await vote(bob, id, 3)).status).toBe(404);
    await db.prepare("UPDATE publication SET state = 'active' WHERE id = ?1").bind(id).run();
    await db.prepare("UPDATE account SET state = 'suspended' WHERE name_key = 'bob'").run();
    const sus = await vote(bob, id, 3);
    expect(sus.status).toBe(403);
    expect(await sus.json()).toEqual({ error: 'suspended' });
    await db.prepare("UPDATE account SET state = 'active' WHERE name_key = 'bob'").run();
    for (const env of [cenvOf({ FLAG_GALLERY: false }), cenvOf({ FLAG_SHARE: false })]) {
      expect((await vote(bob, id, 3, { env })).status).toBe(404);
      expect((await ccall('GET', `/api/u/pub/${id}/vote`, undefined, { cookie: bob, env })).status).toBe(404);
    }
    // Without the CSRF headers.
    expect((await vote(bob, id, 3, { csrf: false })).status).toBe(403);
    expect(await count('vote')).toBe(0);
  });

  it('parallel votes of many accounts lose none: both sums equal a recount', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    const voters: string[] = [];
    for (let i = 0; i < 12; i++) voters.push(await signUp(`voter${i}`));
    for (let i = 0; i < 6; i++) await ageAccount(`voter${i}`, 8);
    // Each votes twice at once (a change racing the first vote).
    await Promise.all(voters.flatMap((v, i) => [vote(v, id, (i % 5) + 1), vote(v, id, ((i + 2) % 5) + 1)]));
    const sums = await expectSums(id);
    expect(sums.vote_count).toBe(12);
    expect(sums.top_count).toBe(6);
  });

  it('a vote ranks only when its account was 7 days old when it was cast or last changed', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    await ageAccount('bob', 6);
    await voted(bob, id, 5);
    expect(await expectSums(id)).toEqual({ vote_sum: 5, vote_count: 1, top_sum: 0, top_count: 0 });
    // A day later the same vote changed: it ranks now.
    await voted(bob, id, 4, { now: NOW + DAY });
    expect(await expectSums(id)).toEqual({ vote_sum: 4, vote_count: 1, top_sum: 4, top_count: 1 });
  });

  it('holds votesPerHour in the statement: parallel votes on many runs never pass it', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await setLimits('bob', { votesPerHour: 3 });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push(await list(alice, { seed: i + 2 }));
    const answers = await Promise.all(ids.map((id) => vote(bob, id, 3)));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 200, 200, 429, 429, 429, 429, 429]);
    expect(await count('vote')).toBe(3);
    for (const id of ids) await expectSums(id);
    // Changing one of the three is still allowed (it is not a new vote of the hour).
    const mine = (await db.prepare('SELECT publication FROM vote LIMIT 1').first<{ publication: string }>())!.publication;
    expect((await vote(bob, mine, 1)).status).toBe(200);
    // An hour later the old ones no longer count.
    const unvoted = (await db.prepare('SELECT id FROM publication WHERE id NOT IN (SELECT publication FROM vote) LIMIT 1').first<{ id: string }>())!.id;
    expect((await vote(bob, unvoted, 2)).status).toBe(429);
    expect((await vote(bob, unvoted, 2, { now: NOW + 3_600_001 })).status).toBe(200);
  });

  it('a removed run takes its votes with it', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    await voted(bob, id, 5);
    expect((await ccall('DELETE', `/api/u/pub/${id}`, undefined, { cookie: alice })).status).toBe(204);
    expect(await count('vote')).toBe(0);
  });
});

describe('suspension, Restore and deletion move the sums', () => {
  async function setup(): Promise<{ id: string; id2: string; bob: string; carol: string }> {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const carol = await signUp('carol');
    await ageAccount('bob', 10);
    const id = await list(alice);
    const id2 = await list(alice, { seed: 2 });
    await voted(bob, id, 5);
    await voted(bob, id2, 1);
    await voted(carol, id, 2);
    return { id, id2, bob, carol };
  }

  it('Suspend takes the votes out, a second Suspend changes nothing, Restore puts them back', async () => {
    const { id, id2 } = await setup();
    expect((await admin('/api/admin/account/bob', { action: 'suspend' })).status).toBe(204);
    expect(await expectSums(id)).toEqual({ vote_sum: 2, vote_count: 1, top_sum: 0, top_count: 0 });
    expect(await expectSums(id2)).toEqual({ vote_sum: 0, vote_count: 0, top_sum: 0, top_count: 0 });
    expect((await admin('/api/admin/account/bob', { action: 'suspend' })).status).toBe(204);
    expect((await expectSums(id)).vote_sum).toBe(2);
    expect((await admin('/api/admin/account/bob', { action: 'restore' })).status).toBe(204);
    expect((await admin('/api/admin/account/bob', { action: 'restore' })).status).toBe(204);
    expect(await expectSums(id)).toEqual({ vote_sum: 7, vote_count: 2, top_sum: 5, top_count: 1 });
    expect(await expectSums(id2)).toEqual({ vote_sum: 1, vote_count: 1, top_sum: 1, top_count: 1 });
  });

  it('a suspended account cannot take its vote back (its votes are out of the sums)', async () => {
    const { id, bob } = await setup();
    await admin('/api/admin/account/bob', { action: 'suspend' });
    expect((await ccall('DELETE', `/api/u/pub/${id}/vote`, undefined, { cookie: bob })).status).toBe(403);
    await expectSums(id);
  });

  it('Delete account deletes the votes and adjusts both sums; of a suspended account only the rows go', async () => {
    const { id, id2, bob } = await setup();
    expect((await ccall('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie: bob })).status).toBe(204);
    expect(await expectSums(id)).toEqual({ vote_sum: 2, vote_count: 1, top_sum: 0, top_count: 0 });
    expect(await expectSums(id2)).toEqual({ vote_sum: 0, vote_count: 0, top_sum: 0, top_count: 0 });
    await admin('/api/admin/account/carol', { action: 'suspend' });
    expect((await admin('/api/admin/account/carol', { action: 'delete', confirm: 'carol' })).status).toBe(204);
    expect(await expectSums(id)).toEqual({ vote_sum: 0, vote_count: 0, top_sum: 0, top_count: 0 });
    expect(await count('vote')).toBe(0);
    expect((await accountRow('alice')).pub_count).toBe(2);
  });

  it('parallel votes racing a Suspend leave the sums equal to a recount', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    const bob = await signUp('bob');
    const ids = [id, await list(alice, { seed: 3 }), await list(alice, { seed: 4 })];
    await Promise.all([...ids.map((x, i) => vote(bob, x, i + 1)), admin('/api/admin/account/bob', { action: 'suspend' }), ...ids.map((x) => vote(bob, x, 5))]);
    for (const x of ids) await expectSums(x);
    await admin('/api/admin/account/bob', { action: 'restore' });
    for (const x of ids) await expectSums(x);
  });
});
