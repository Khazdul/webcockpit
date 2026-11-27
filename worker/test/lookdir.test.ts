// The directory of shared looks (stage 80 part E, spec §7.14, ADR 0173):
// the three route families, the owner rule (first owner, refusal, the 30
// days, the take-over), every field's check, the limits, the cron's
// pruning, account deletion, the flag, and the admin's count and removal.
import { beforeEach, describe, expect, it } from 'vitest';
import { LOOK_FIND_MAX, LOOK_NAMES_PER_OWNER, LOOK_REPORTS_PER_HOUR, type AdminStats, type LookFindAnswer } from '../../shared/cloud/api.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import type { RateLimiter } from '../runtime.ts';
import { admin, adminEnv, adminJson, forgetAccessKeys } from './access-helpers.ts';
import { db, emptyTables, envWith } from './helpers.ts';
import { AUTH_KEY, DAY, NOW, call, envOf, signUp } from './share-helpers.ts';

const KEY_A = '0b7e4d1c-3f2a-4b9e-8c1d-5e6f7a8b9c0d';
const KEY_B = '1c8f5e2d-4a3b-4cae-9d2e-6f7a8b9cad1e';
const JSON_HEADERS = { 'content-type': 'application/json' };

const row = (name: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({ name, race: 'elf', subrace: 'noldo', sex: 'female', token: null, ...over });
const put = (body: unknown, o: { now?: number; ip?: string; env?: ReturnType<typeof envOf>; headers?: Record<string, string> } = {}): Promise<Response> =>
  call('PUT', '/api/look', body, { headers: { ...JSON_HEADERS, ...o.headers }, ...(o.now ? { now: o.now } : {}), ...(o.ip ? { ip: o.ip } : {}), ...(o.env ? { env: o.env } : {}) });
const report = (key: string, name: string, over: Record<string, unknown> = {}, o: Parameters<typeof put>[1] = {}): Promise<Response> => put({ key, ...row(name, over) }, o);
const unshare = (key: string, o: { now?: number; ip?: string } = {}): Promise<Response> => call('DELETE', '/api/look', { key }, { headers: JSON_HEADERS, ...o });
const find = (names: unknown, o: { ip?: string; env?: ReturnType<typeof envOf> } = {}): Promise<Response> => call('POST', '/api/look/find', { names }, { headers: JSON_HEADERS, ...o });
const found = async (...names: string[]): Promise<LookFindAnswer['looks']> => {
  const res = await find(names);
  expect(res.status).toBe(200);
  return ((await res.json()) as LookFindAnswer).looks;
};
const rows = async (): Promise<{ name: string; owner: string; updated: number }[]> =>
  (await db.prepare('SELECT name, owner, updated FROM look_dir ORDER BY name').all<{ name: string; owner: string; updated: number }>()).results;
const errorOf = async (res: Response): Promise<string> => ((await res.json()) as { error: string }).error;

let ipn = 0;
/** A fresh address per test, so the address counter does not carry over. */
const ip = (): string => `192.0.2.${(ipn++ % 250) + 1}`;

beforeEach(async () => {
  await emptyTables();
  forgetAccessKeys();
});

describe('PUT /api/look and POST /api/look/find', () => {
  it('stores a report and answers it to anyone, without an owner', async () => {
    expect((await report(KEY_A, 'Glorfindel', { token: 'elf-f-noldor' })).status).toBe(204);
    const looks = await found('glorfindel', 'Nobody');
    expect(looks).toEqual({ glorfindel: { race: 'elf', subrace: 'noldo', sex: 'female', token: 'elf-f-noldor' } });
    const [r] = await rows();
    expect(r?.name).toBe('glorfindel');
    // A keyed hash, neither the key nor anything readable.
    expect(r?.owner).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r?.owner).not.toContain(KEY_A);
  });

  it('a second report of the same owner refreshes the row', async () => {
    await report(KEY_A, 'Rasta', { race: 'human', subrace: null, sex: null });
    expect((await report(KEY_A, 'rasta', { race: 'human', subrace: 'dunadan', sex: 'male' }, { now: NOW + DAY })).status).toBe(204);
    expect(await found('Rasta')).toEqual({ rasta: { race: 'human', subrace: 'dunadan', sex: 'male', token: null } });
    expect((await rows())[0]?.updated).toBe(NOW + DAY);
  });

  it('nulls are kept as not known', async () => {
    expect((await report(KEY_A, 'Dubb', { race: null, subrace: null, sex: null, token: null })).status).toBe(204);
    expect(await found('dubb')).toEqual({ dubb: { race: null, subrace: null, sex: null, token: null } });
  });

  it('find dedupes names in any case, takes at most 40, and refuses what is not a name', async () => {
    await report(KEY_A, 'Rasta');
    expect(Object.keys(await found('RASTA', 'rasta', 'Rasta'))).toEqual(['rasta']);
    const forty = Array.from({ length: LOOK_FIND_MAX }, (_, i) => `name${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    expect((await find(forty)).status).toBe(200);
    expect((await find([...forty, 'onemore'])).status).toBe(400);
    for (const bad of [[], ['a'], ['x'.repeat(21)], ['two words'], ['Rasta1'], [42], 'rasta', null]) expect((await find(bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await call('POST', '/api/look/find', { names: ['rasta'], extra: 1 }, { headers: JSON_HEADERS })).status).toBe(400);
  });
});

describe('validation of a report', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['a name of one letter', { name: 'A' }],
    ['a name of 21 letters', { name: 'x'.repeat(21) }],
    ['a name with a digit', { name: 'Rasta2' }],
    ['a name with a space', { name: 'Ra sta' }],
    ['a name with a letter outside a-z', { name: 'Rästa' }],
    ['a race of MUME’s text', { race: 'Elf' }],
    ['an unknown race', { race: 'ent' }],
    ['a subrace of another race', { race: 'human', subrace: 'noldo' }],
    ['a subrace without a race', { race: null, subrace: 'noldo' }],
    ['an unknown subrace', { subrace: 'vanya' }],
    ['a sex of free text', { sex: 'f' }],
    ['a token the library does not have', { token: 'elf-f-nobody' }],
    ['a token that is a link', { token: 'https://example.org/x.png' }],
    ['a number for a field', { sex: 1 }],
  ];
  for (const [what, over] of cases) {
    it(`refuses ${what}`, async () => {
      expect((await report(KEY_A, 'Rasta', over)).status).toBe(400);
      expect(await rows()).toEqual([]);
    });
  }

  it('refuses a missing or an extra field, a bad key, and a body that is not JSON', async () => {
    const full = { key: KEY_A, ...row('Rasta') };
    for (const k of Object.keys(full)) {
      const b: Record<string, unknown> = { ...full };
      delete b[k];
      expect((await put(b)).status, k).toBe(400);
    }
    expect((await put({ ...full, note: 'hi' })).status).toBe(400);
    expect((await put({ ...full, key: 'not-a-uuid' })).status).toBe(400);
    expect((await put({ ...full, key: KEY_A.toUpperCase() })).status).toBe(400);
    expect((await call('PUT', '/api/look', undefined, { headers: JSON_HEADERS, body: '{' })).status).toBe(400);
    expect((await call('PUT', '/api/look', undefined, { headers: JSON_HEADERS, body: JSON.stringify({ ...full, pad: 'x'.repeat(3000) }) })).status).toBe(400);
  });

  it('wants JSON, X-WC: 1 and the site’s Origin; other methods are 405', async () => {
    const body = { key: KEY_A, ...row('Rasta') };
    expect((await call('PUT', '/api/look', body, { headers: { 'content-type': 'text/plain' } })).status).toBe(403);
    expect((await call('PUT', '/api/look', body, { headers: JSON_HEADERS, csrf: false })).status).toBe(403);
    expect((await call('PUT', '/api/look', body, { headers: { ...JSON_HEADERS, 'x-wc': '1', origin: 'https://evil.example' }, csrf: false })).status).toBe(403);
    expect((await call('POST', '/api/look/find', { names: ['rasta'] }, { csrf: false, headers: JSON_HEADERS })).status).toBe(403);
    expect((await call('GET', '/api/look')).status).toBe(405);
    expect((await call('GET', '/api/look/find')).status).toBe(405);
    expect((await call('POST', '/api/look', body, { headers: JSON_HEADERS })).status).toBe(405);
  });
});

describe('the owner rule', () => {
  it('the first reporter owns a name; another owner is refused while the row is fresher than 30 days', async () => {
    expect((await report(KEY_A, 'Rasta', { token: 'elf-f-noldor' })).status).toBe(204);
    const refused = await report(KEY_B, 'Rasta', { race: 'orc', subrace: null, token: null }, { now: NOW + 29 * DAY });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toBe('look_owned');
    expect(await found('rasta')).toEqual({ rasta: { race: 'elf', subrace: 'noldo', sex: 'female', token: 'elf-f-noldor' } });
    // The other owner's DELETE removes nothing of it.
    expect((await unshare(KEY_B)).status).toBe(204);
    expect((await rows()).length).toBe(1);
  });

  it('a row not refreshed for 30 days may be taken over by another owner', async () => {
    await report(KEY_A, 'Rasta');
    const owner = (await rows())[0]?.owner;
    expect((await report(KEY_B, 'Rasta', { race: 'orc', subrace: null }, { now: NOW + 30 * DAY })).status).toBe(204);
    expect((await rows())[0]?.owner).not.toBe(owner);
    expect((await found('rasta')).rasta?.race).toBe('orc');
    // And it is the new owner's now: the first is refused.
    expect((await report(KEY_A, 'Rasta', {}, { now: NOW + 31 * DAY })).status).toBe(409);
  });

  it('a refresh keeps the 30 days running from the last report', async () => {
    await report(KEY_A, 'Rasta');
    await report(KEY_A, 'Rasta', {}, { now: NOW + 20 * DAY });
    expect((await report(KEY_B, 'Rasta', {}, { now: NOW + 40 * DAY })).status).toBe(409);
    expect((await report(KEY_B, 'Rasta', {}, { now: NOW + 50 * DAY })).status).toBe(204);
  });

  it('the take-over at login: DELETE with the key, then the account reports the name', async () => {
    await report(KEY_A, 'Rasta');
    const cookie = await signUp('alice');
    const refused = await call('PUT', '/api/u/look', row('Rasta'), { cookie, headers: JSON_HEADERS });
    expect(refused.status).toBe(409);
    expect((await unshare(KEY_A)).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect((await call('PUT', '/api/u/look', row('Rasta', { token: 'elf-f-noldor' }), { cookie, headers: JSON_HEADERS })).status).toBe(204);
    expect((await found('rasta')).rasta?.token).toBe('elf-f-noldor');
    // Logged out again, the device's key cannot take it back.
    expect((await report(KEY_A, 'Rasta')).status).toBe(409);
  });

  it('an owner holds at most 20 names; a name it has can still be refreshed', async () => {
    const names = Array.from({ length: LOOK_NAMES_PER_OWNER }, (_, i) => `char${String.fromCharCode(97 + i)}`);
    for (const [i, n] of names.entries()) expect((await report(KEY_A, n, {}, { now: NOW + i * 1000, ip: `198.18.0.${i}` })).status).toBe(204);
    const full = await report(KEY_A, 'charz', {}, { now: NOW + 3 * 3_600_000 });
    expect(full.status).toBe(409);
    expect(await errorOf(full)).toBe('too_many_names');
    expect((await report(KEY_A, 'chara', { sex: 'male' }, { now: NOW + 3 * 3_600_000 })).status).toBe(204);
    // Another owner is not limited by it.
    expect((await report(KEY_B, 'charz', {}, { now: NOW + 3 * 3_600_000 })).status).toBe(204);
  });

  it('DELETE /api/look removes every row of the key and none of another', async () => {
    await report(KEY_A, 'Rasta');
    await report(KEY_A, 'Dubb');
    await report(KEY_B, 'Glorfindel');
    expect((await unshare(KEY_A)).status).toBe(204);
    expect((await rows()).map((r) => r.name)).toEqual(['glorfindel']);
    expect((await call('DELETE', '/api/look', { key: 'nope' }, { headers: JSON_HEADERS })).status).toBe(400);
    expect((await call('DELETE', '/api/look', { key: KEY_A, name: 'x' }, { headers: JSON_HEADERS })).status).toBe(400);
  });
});

describe('/api/u/look', () => {
  it('reports and removes the account’s rows; it needs a session', async () => {
    const cookie = await signUp('alice');
    expect((await call('PUT', '/api/u/look', row('Rasta'), { cookie, headers: JSON_HEADERS })).status).toBe(204);
    expect((await call('PUT', '/api/u/look', row('Dubb', { race: 'beorning', subrace: null }), { cookie, headers: JSON_HEADERS })).status).toBe(204);
    expect(Object.keys(await found('rasta', 'dubb')).sort()).toEqual(['dubb', 'rasta']);
    expect((await call('DELETE', '/api/u/look', undefined, { cookie })).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect((await call('PUT', '/api/u/look', row('Rasta'), { headers: JSON_HEADERS })).status).toBe(401);
    expect((await call('PUT', '/api/u/look', row('Rasta'), { cookie, headers: JSON_HEADERS, csrf: false })).status).toBe(403);
  });

  it('refuses a key in the body and a bad field', async () => {
    const cookie = await signUp('alice');
    expect((await call('PUT', '/api/u/look', { key: KEY_A, ...row('Rasta') }, { cookie, headers: JSON_HEADERS })).status).toBe(400);
    expect((await call('PUT', '/api/u/look', row('Rasta', { race: 'Elf' }), { cookie, headers: JSON_HEADERS })).status).toBe(400);
  });

  it('two accounts: the second is refused the first one’s name', async () => {
    const a = await signUp('alice');
    const b = await signUp('bobby');
    expect((await call('PUT', '/api/u/look', row('Rasta'), { cookie: a, headers: JSON_HEADERS })).status).toBe(204);
    expect((await call('PUT', '/api/u/look', row('Rasta'), { cookie: b, headers: JSON_HEADERS })).status).toBe(409);
  });

  it('deleting an account deletes its rows, and only its', async () => {
    const cookie = await signUp('alice');
    await call('PUT', '/api/u/look', row('Rasta'), { cookie, headers: JSON_HEADERS });
    await report(KEY_A, 'Glorfindel');
    expect((await call('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie })).status).toBe(204);
    expect((await rows()).map((r) => r.name)).toEqual(['glorfindel']);
  });

  it('the admin’s deletion of an account deletes its rows too', async () => {
    const cookie = await signUp('alice');
    await call('PUT', '/api/u/look', row('Rasta'), { cookie, headers: JSON_HEADERS });
    expect((await admin('/api/admin/account/alice', { body: { action: 'delete', confirm: 'alice' }, env: adminEnv({ FLAG_LOOKS: true }) })).status).toBe(204);
    expect(await rows()).toEqual([]);
  });
});

describe('limits', () => {
  it('reports: 30 an hour per owner, from any address; the next hour again', async () => {
    for (let i = 0; i < LOOK_REPORTS_PER_HOUR; i++) expect((await report(KEY_A, 'Rasta', {}, { now: NOW + i, ip: `198.18.1.${i}` })).status).toBe(204);
    expect((await report(KEY_A, 'Rasta', {}, { now: NOW + 100, ip: '198.18.2.1' })).status).toBe(429);
    expect((await unshare(KEY_A, { now: NOW + 101, ip: '198.18.2.2' })).status).toBe(429);
    expect((await report(KEY_A, 'Rasta', {}, { now: NOW + 3_600_000, ip: '198.18.2.3' })).status).toBe(204);
  });

  it('reports: 30 an hour per address, whatever the key', async () => {
    const keys = Array.from({ length: LOOK_REPORTS_PER_HOUR + 1 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`);
    for (let i = 0; i < LOOK_REPORTS_PER_HOUR; i++) expect((await report(keys[i]!, `char${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, {}, { ip: '198.18.3.1' })).status).toBe(204);
    expect((await report(keys[LOOK_REPORTS_PER_HOUR]!, 'Other', {}, { ip: '198.18.3.1' })).status).toBe(429);
    expect((await report(keys[LOOK_REPORTS_PER_HOUR]!, 'Other', {}, { ip: '198.18.3.2' })).status).toBe(204);
    // The counters are keyed hashes: no address in the table.
    const { results } = await db.prepare('SELECT key FROM attempt').all<{ key: string }>();
    expect(results.some((r) => r.key.includes('198.18'))).toBe(false);
  });

  it('find: the binding LOOK_LIMITER per address', async () => {
    let n = 0;
    const keys: string[] = [];
    const limiter: RateLimiter = { limit: async ({ key }) => (keys.push(key), { success: ++n <= 2 }) };
    const env = envOf({ LOOK_LIMITER: limiter });
    expect((await find(['rasta'], { env, ip: '198.18.4.1' })).status).toBe(200);
    expect((await find(['rasta'], { env, ip: '198.18.4.1' })).status).toBe(200);
    expect((await find(['rasta'], { env, ip: '198.18.4.1' })).status).toBe(429);
    expect(keys).toEqual(['198.18.4.1', '198.18.4.1', '198.18.4.1']);
  });
});

describe('the flag, the secrets, the database', () => {
  it('with the flag off every route is 404', async () => {
    const env = envOf({ FLAG_LOOKS: false });
    expect((await put({ key: KEY_A, ...row('Rasta') }, { env })).status).toBe(404);
    expect((await call('DELETE', '/api/look', { key: KEY_A }, { env, headers: JSON_HEADERS })).status).toBe(404);
    expect((await find(['rasta'], { env })).status).toBe(404);
    const cookie = await signUp('alice');
    expect((await call('PUT', '/api/u/look', row('Rasta'), { env, cookie, headers: JSON_HEADERS })).status).toBe(404);
    expect((await call('DELETE', '/api/u/look', undefined, { env, cookie })).status).toBe(404);
    expect(await rows()).toEqual([]);
  });

  it('without AUTH_PEPPER a report is 503; find still answers', async () => {
    const env = envOf({ AUTH_PEPPER: undefined });
    const res = await put({ key: KEY_A, ...row('Rasta') }, { env });
    expect(res.status).toBe(503);
    expect(await errorOf(res)).toBe('looks_not_configured');
    expect((await call('DELETE', '/api/look', { key: KEY_A }, { env, headers: JSON_HEADERS })).status).toBe(503);
    expect((await find(['rasta'], { env })).status).toBe(200);
  });

  it('without the database: 503', async () => {
    const env = envOf({ DB: undefined });
    expect((await find(['rasta'], { env })).status).toBe(503);
  });
});

describe('the daily cron', () => {
  it('removes rows not refreshed for 180 days', async () => {
    await report(KEY_A, 'Old', {}, { now: NOW });
    await report(KEY_A, 'Fresh', {}, { now: NOW + 100 * DAY, ip: ip() });
    await runCron(envWith({}), DAILY_CRON, NOW + 180 * DAY + 1);
    expect((await rows()).map((r) => r.name)).toEqual(['fresh']);
  });
});

describe('the admin', () => {
  const env = adminEnv({ FLAG_LOOKS: true });

  it('counts the rows on the stats, reads a row by name and removes it, logged as look.remove', async () => {
    await report(KEY_A, 'Rasta', { token: 'elf-f-noldor' });
    await report(KEY_A, 'Dubb');
    expect((await adminJson<AdminStats>('/api/admin/stats', { env })).looks).toBe(2);
    expect(await adminJson('/api/admin/look/RASTA', { env })).toEqual({ name: 'rasta', race: 'elf', subrace: 'noldo', sex: 'female', token: 'elf-f-noldor', updated: NOW });
    expect((await admin('/api/admin/look/rasta', { env, method: 'DELETE', body: { note: 'held by a stranger' } })).status).toBe(204);
    expect((await rows()).map((r) => r.name)).toEqual(['dubb']);
    const log = (await db.prepare('SELECT action, target, note FROM admin_log').all()).results;
    expect(log).toEqual([{ action: 'look.remove', target: 'rasta', note: 'held by a stranger' }]);
    // In the log's moderation filter.
    const page = await adminJson<{ entries: { action: string }[] }>('/api/admin/log?kind=moderation', { env });
    expect(page.entries.map((e) => e.action)).toEqual(['look.remove']);
  });

  it('a name without a row is 404 and logs nothing; a removal needs X-WC and the Origin', async () => {
    expect((await admin('/api/admin/look/rasta', { env })).status).toBe(404);
    expect((await admin('/api/admin/look/rasta', { env, method: 'DELETE', body: {} })).status).toBe(404);
    expect((await admin('/api/admin/look/ra1', { env })).status).toBe(404);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM admin_log').first<{ n: number }>())?.n).toBe(0);
    await report(KEY_A, 'Rasta');
    expect((await admin('/api/admin/look/rasta', { env, method: 'DELETE', body: {}, headers: { 'Content-Type': 'application/json' } })).status).toBe(403);
    expect((await rows()).length).toBe(1);
    // Without Access: refused before anything.
    expect((await admin('/api/admin/look/rasta', { env, token: null })).status).not.toBe(200);
  });
});

