// The run bodies (worker/runs.ts; the contract is "Runs in the cloud" in
// shared/cloud/api.ts), the kinds the flag `runs` opens, the run bytes in
// every usage, and Delete account's R2 prefix, in workerd with a local R2.
// The test Worker has the flag `runs` off (as production); these tests
// turn it on through the env.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Account,
  DEFAULT_ACCOUNT_LIMITS,
  DEFAULT_KDF,
  type RunBodyList,
  type RunBodyWritten,
  SESSION_COOKIE,
  type SyncChanges,
  type SyncWritten,
} from '../../shared/cloud/api.ts';
import { toB64url } from '../bytes.ts';
import { handle } from '../router.ts';
import type { Deps, Env, R2 } from '../runtime.ts';
import { SWEEP_AFTER_MS, emptyPrefix, prefixOf } from '../runs.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import { T, at, bucket, count, db, emptyTables, envWith, faultyBucket, r2Keys } from './helpers.ts';

const ORIGIN = 'https://example.test';
const NOW = T('2026-11-15T12:00:00Z');
const MIN = 60_000;

const BASE = { API_LIMITER: undefined, AUTH_LIMITER: undefined, FLAG_RUNS: true };
const ENV = envWith(BASE);
/** The env with the flag on and other bindings or vars replaced. */
const envOf = (over: Partial<Record<keyof Env, unknown>>): Env => envWith({ ...BASE, ...over });

const bytes = (n: number, fill: number): string => toB64url(Uint8Array.from({ length: n }, (_, i) => (fill * 31 + i * 7) & 255));
const key = (seed: number): string => bytes(32, seed);
/** A body of `n` bytes made from `fill`. */
const body = (n: number, fill = 1): Uint8Array<ArrayBuffer> => Uint8Array.from({ length: n }, (_, i) => (fill * 13 + i) & 255);
/** A server id (22 characters of base64url) by number. */
const idOf = (n: number): string => toB64url(Uint8Array.from({ length: 16 }, (_, i) => (n * 17 + i) & 255));

const siteverify: Deps['fetch'] = async (_url, init) => {
  const token = (JSON.parse(init?.body ?? '{}') as { response?: unknown }).response;
  return Response.json(token === 'ok' ? { success: true, hostname: 'example.com', 'error-codes': [] } : { success: false, 'error-codes': ['invalid-input-response'] });
};

interface Opts {
  now?: number;
  env?: Env;
  cookie?: string;
  headers?: Record<string, string>;
  csrf?: boolean;
  body?: BodyInit;
  ip?: string;
}

function call(method: string, path: string, json?: unknown, o: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '203.0.113.7' };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.csrf !== false && method !== 'GET' && method !== 'HEAD') {
    headers['x-wc'] = '1';
    headers.origin = ORIGIN;
  }
  const init: RequestInit = { method, headers: { ...headers, ...o.headers } };
  if (o.body !== undefined) init.body = o.body;
  else if (json !== undefined) init.body = JSON.stringify(json);
  return handle(new Request(`${ORIGIN}${path}`, init), o.env ?? ENV, at(o.now ?? NOW, siteverify));
}

function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

let ips = 0;
async function signUp(name: string): Promise<string> {
  ips++;
  const res = await call(
    'POST',
    '/api/auth/register',
    { name, salt: bytes(16, 9), kdf: { ...DEFAULT_KDF }, authKey: key(1), recoveryAuth: key(2), wrapPw: bytes(61, 3), wrapRc: bytes(61, 4), label: 'Firefox on Linux', turnstile: 'ok' },
    { ip: `198.51.100.${ips}` },
  );
  expect(res.status, `register ${name}`).toBe(201);
  return cookieOf(res);
}

const runPath = (id: string): string => `/api/u/runs/${id}`;

/** PUT a body with its Content-Length (a Request made in the Worker has none of its own). */
function put(cookie: string, id: string, b: Uint8Array<ArrayBuffer>, o: Opts = {}): Promise<Response> {
  return call('PUT', runPath(id), undefined, { ...o, cookie, headers: { 'content-type': 'application/octet-stream', 'content-length': String(b.length), ...o.headers }, body: b });
}

async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}

async function errorOf(res: Response): Promise<unknown> {
  return res.json();
}

async function accountId(name: string): Promise<string> {
  return ((await db.prepare('SELECT id FROM account WHERE name_key = ?1').bind(name).first<{ id: string }>()) as { id: string }).id;
}

async function account(cookie: string, env = ENV): Promise<Account> {
  return (await ok<{ account: Account }>(await call('GET', '/api/u/account', undefined, { cookie, env }))).account;
}

async function list(cookie: string, env = ENV): Promise<RunBodyList> {
  return ok<RunBodyList>(await call('GET', '/api/u/runs', undefined, { cookie, env }));
}

async function runBytes(name: string): Promise<number> {
  return ((await db.prepare('SELECT run_bytes AS n FROM account WHERE name_key = ?1').bind(name).first<{ n: number }>()) as { n: number }).n;
}

async function setLimits(limits: Record<string, number>): Promise<void> {
  await db.prepare('UPDATE account SET limits = ?1').bind(JSON.stringify(limits)).run();
}

async function stored(key: string): Promise<Uint8Array | null> {
  const obj = await bucket.get(key);
  return obj ? new Uint8Array(await new Response(obj.body).arrayBuffer()) : null;
}

beforeEach(async () => {
  await emptyTables();
});

describe('the flag runs', () => {
  it('off: every run path answers 404 not_found, and run and exportDoc stay kind_closed', async () => {
    const cookie = await signUp('alice');
    const off = envWith({ API_LIMITER: undefined, AUTH_LIMITER: undefined });
    for (const [method, path] of [
      ['GET', '/api/u/runs'],
      ['PUT', runPath(idOf(1))],
      ['GET', runPath(idOf(1))],
      ['DELETE', runPath(idOf(1))],
      ['POST', '/api/u/runs'],
    ] as const) {
      const res = await call(method, path, undefined, { cookie, env: off, headers: { 'content-type': 'application/octet-stream' }, ...(method === 'PUT' ? { body: body(10) } : {}) });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    expect(await r2Keys()).toEqual([]);
    for (const kind of ['run', 'exportDoc']) {
      const res = await call('PUT', `/api/u/sync/items/${kind}/${idOf(1)}`, undefined, {
        cookie,
        env: off,
        headers: { 'content-type': 'application/octet-stream', 'if-match': '0' },
        body: body(10),
      });
      expect(res.status, kind).toBe(403);
      expect(await res.json()).toEqual({ error: 'kind_closed' });
    }
    const config = (await (await call('GET', '/api/config', undefined, { env: off })).json()) as { flags: Record<string, boolean> };
    expect(config.flags.runs).toBe(false);
  });

  it('on: the run paths answer, and run and exportDoc are open kinds with the others', async () => {
    const cookie = await signUp('alice');
    expect((await call('GET', '/api/u/runs', undefined, { cookie })).status).toBe(200);
    for (const [n, kind] of ['run', 'exportDoc', 'profile'].entries()) {
      const res = await call('PUT', `/api/u/sync/items/${kind}/${idOf(n)}`, undefined, {
        cookie,
        headers: { 'content-type': 'application/octet-stream', 'if-match': '0' },
        body: body(10),
      });
      expect(res.status, kind).toBe(200);
    }
    const config = (await (await call('GET', '/api/config')).json()) as { flags: Record<string, boolean> };
    expect(config.flags.runs).toBe(true);
  });

  it('the flag accounts off closes them too; no session is 401; no X-WC or another Origin is 403', async () => {
    const cookie = await signUp('alice');
    expect((await call('GET', '/api/u/runs', undefined, { cookie, env: envOf({ FLAG_ACCOUNTS: false }) })).status).toBe(404);
    expect(await errorOf(await call('GET', '/api/u/runs'))).toEqual({ error: 'unauthorized' });
    expect((await put(`${SESSION_COOKIE}=${bytes(32, 5)}`, idOf(1), body(10))).status).toBe(401);
    expect((await put(cookie, idOf(1), body(10), { csrf: false })).status).toBe(403);
    expect((await put(cookie, idOf(1), body(10), { headers: { origin: 'https://evil.test' } })).status).toBe(403);
    expect((await call('DELETE', runPath(idOf(1)), undefined, { cookie, csrf: false })).status).toBe(403);
    expect(await r2Keys()).toEqual([]);
  });

  it('without the R2 binding the run endpoints answer 503', async () => {
    const cookie = await signUp('alice');
    const none = envOf({ FILES: undefined });
    expect((await put(cookie, idOf(1), body(10), { env: none })).status).toBe(503);
    expect((await call('GET', runPath(idOf(1)), undefined, { cookie, env: none })).status).toBe(503);
    expect(await runBytes('alice')).toBe(0);
  });
});

describe('PUT, GET and DELETE /api/u/runs/<id>', () => {
  it('a body: stored under u/<account>/<id>, counted, read back with its length, listed, deleted', async () => {
    const cookie = await signUp('alice');
    const acc = await accountId('alice');
    const id = idOf(1);
    const w = await ok<RunBodyWritten>(await put(cookie, id, body(1000)));
    expect(w).toEqual({ size: 1000, usage: { items: 0, itemBytes: 0, runBytes: 1000, lookImages: 0, lookBytes: 0 } });
    expect(await r2Keys()).toEqual([`u/${acc}/${id}`]);
    expect(await stored(`u/${acc}/${id}`)).toEqual(body(1000));

    const res = await call('GET', runPath(id), undefined, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body(1000));
    const head = await call('HEAD', runPath(id), undefined, { cookie });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('1000');

    expect(await list(cookie)).toEqual({ bodies: [{ id, size: 1000, created: NOW }], usage: { items: 0, itemBytes: 0, runBytes: 1000, lookImages: 0, lookBytes: 0 }, limits: DEFAULT_ACCOUNT_LIMITS });

    const d = await ok<RunBodyWritten>(await call('DELETE', runPath(id), undefined, { cookie }));
    expect(d).toEqual({ size: 0, usage: { items: 0, itemBytes: 0, runBytes: 0, lookImages: 0, lookBytes: 0 } });
    expect(await r2Keys()).toEqual([]);
    expect(await count('run_body')).toBe(0);
    expect(await errorOf(await call('GET', runPath(id), undefined, { cookie }))).toEqual({ error: 'not_found' });
    // A delete of none is 200 too, and changes nothing.
    expect(await ok<RunBodyWritten>(await call('DELETE', runPath(idOf(9)), undefined, { cookie }))).toEqual({ size: 0, usage: { items: 0, itemBytes: 0, runBytes: 0, lookImages: 0, lookBytes: 0 } });
  });

  it('GET of a body that is not there is 404 not_found', async () => {
    const cookie = await signUp('alice');
    const res = await call('GET', runPath(idOf(1)), undefined, { cookie });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('what a PUT must have: an id of the pattern, octet-stream, a Content-Length (411), a body; other methods 405', async () => {
    const cookie = await signUp('alice');
    for (const path of ['/api/u/runs/short', `/api/u/runs/${idOf(1)}A`, '/api/u/runs/a+bcdefghijklmnopqrstu', `/api/u/runs/${idOf(1)}/more`]) {
      const res = await call('PUT', path, undefined, { cookie, headers: { 'content-type': 'application/octet-stream' }, body: body(10) });
      expect(res.status, path).toBe(400);
      expect((await call('GET', path, undefined, { cookie })).status, path).toBe(400);
    }
    expect((await put(cookie, idOf(1), body(10), { headers: { 'content-type': 'text/plain' } })).status).toBe(400);
    expect((await call('PUT', runPath(idOf(1)), undefined, { cookie, body: body(10) })).status).toBe(400);
    expect((await put(cookie, idOf(1), new Uint8Array(0))).status).toBe(400);
    // A streamed body carries no Content-Length.
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(body(10));
        ctl.close();
      },
    });
    const res = await call('PUT', runPath(idOf(1)), undefined, { cookie, headers: { 'content-type': 'application/octet-stream' }, body: stream });
    expect(res.status).toBe(411);
    expect(await res.json()).toEqual({ error: 'length_required' });
    expect((await call('POST', runPath(idOf(1)), undefined, { cookie })).status).toBe(405);
    expect((await call('PUT', '/api/u/runs', undefined, { cookie })).status).toBe(405);
    expect((await call('GET', '/api/u/runs/', undefined, { cookie })).status).toBe(404);
    expect(await r2Keys()).toEqual([]);
    expect(await runBytes('alice')).toBe(0);
  });

  it('over runMaxBytes: 413 run_too_large with the limit, before anything is stored', async () => {
    const cookie = await signUp('alice');
    await setLimits({ runMaxBytes: 100 });
    expect(await ok<RunBodyWritten>(await put(cookie, idOf(1), body(100)))).toMatchObject({ size: 100 });
    const res = await put(cookie, idOf(2), body(101));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'run_too_large', limit: 100 });
    expect(await r2Keys()).toHaveLength(1);
    expect(await runBytes('alice')).toBe(100);
  });

  it('no room: 413 quota with used, limit and size; a body that fits still goes', async () => {
    const cookie = await signUp('alice');
    await setLimits({ runBytes: 100 });
    await ok(await put(cookie, idOf(1), body(70)));
    const res = await put(cookie, idOf(2), body(31));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'quota', used: 70, limit: 100, size: 31 });
    expect(await r2Keys()).toHaveLength(1);
    expect(await ok<RunBodyWritten>(await put(cookie, idOf(2), body(30)))).toEqual({ size: 30, usage: { items: 0, itemBytes: 0, runBytes: 100, lookImages: 0, lookBytes: 0 } });
  });

  it('two parallel PUTs at the limit: only one passes, and the counter holds just it', async () => {
    const cookie = await signUp('alice');
    await setLimits({ runBytes: 100 });
    const results = await Promise.all([put(cookie, idOf(1), body(60, 1)), put(cookie, idOf(2), body(60, 2))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 413]);
    const refused = results.find((r) => r.status === 413) as Response;
    expect(await refused.json()).toEqual({ error: 'quota', used: 60, limit: 100, size: 60 });
    expect(await runBytes('alice')).toBe(60);
    expect(await r2Keys()).toHaveLength(1);
    expect(await count('run_body')).toBe(1);
    // Many at once: never past the limit, and the counter is the sum of the rows.
    await call('DELETE', runPath(idOf(1)), undefined, { cookie });
    await call('DELETE', runPath(idOf(2)), undefined, { cookie });
    const many = await Promise.all(Array.from({ length: 8 }, (_, i) => put(cookie, idOf(10 + i), body(30, i))));
    expect(many.filter((r) => r.status === 200)).toHaveLength(3);
    const sum = (await db.prepare('SELECT SUM(size) AS s FROM run_body').first<{ s: number }>())?.s;
    expect(await runBytes('alice')).toBe(90);
    expect(sum).toBe(90);
  });

  it('a replace: a shrink frees its room, a grow needs only the difference, and a PUT that does not grow is never refused', async () => {
    const cookie = await signUp('alice');
    await setLimits({ runBytes: 100 });
    const acc = await accountId('alice');
    await ok(await put(cookie, idOf(1), body(60, 1)));
    await ok(await put(cookie, idOf(2), body(30, 2)));
    // Grow by 10 to exactly the limit.
    expect(await ok<RunBodyWritten>(await put(cookie, idOf(2), body(40, 3), { now: NOW + MIN }))).toEqual({ size: 40, usage: { items: 0, itemBytes: 0, runBytes: 100, lookImages: 0, lookBytes: 0 } });
    expect(await stored(`u/${acc}/${idOf(2)}`)).toEqual(body(40, 3));
    // Grow by 1 more: no room.
    expect(await errorOf(await put(cookie, idOf(2), body(41)))).toEqual({ error: 'quota', used: 100, limit: 100, size: 41 });
    expect(await stored(`u/${acc}/${idOf(2)}`)).toEqual(body(40, 3));
    // Shrink.
    expect(await ok<RunBodyWritten>(await put(cookie, idOf(1), body(20, 4)))).toMatchObject({ usage: { runBytes: 60 } });
    // The limit lowered below the usage: the same size and a shrink still go.
    await setLimits({ runBytes: 10 });
    expect((await put(cookie, idOf(2), body(40, 5))).status).toBe(200);
    expect((await put(cookie, idOf(2), body(35, 6))).status).toBe(200);
    expect(await runBytes('alice')).toBe(55);
    const l = await list(cookie);
    expect(l.bodies).toEqual([
      { id: idOf(1), size: 20, created: NOW },
      { id: idOf(2), size: 35, created: NOW },
    ]);
    expect(l.usage.runBytes).toBe(55);
    expect(l.limits.runBytes).toBe(10);
  });

  it('an R2 failure gives the room back and answers 503; an old body stays as it was', async () => {
    const cookie = await signUp('alice');
    const acc = await accountId('alice');
    await setLimits({ runBytes: 100 });
    await ok(await put(cookie, idOf(1), body(50, 1)));
    const failing = faultyBucket({ fail: ['put'] });
    const env = envOf({ FILES: failing });
    const res = await put(cookie, idOf(2), body(50), { env });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(failing.calls.put).toBe(1);
    expect(await runBytes('alice')).toBe(50);
    expect(await count('run_body')).toBe(1);
    // A replace that fails: the old body and its size stay.
    expect((await put(cookie, idOf(1), body(80, 2), { env })).status).toBe(503);
    expect(await runBytes('alice')).toBe(50);
    expect(await stored(`u/${acc}/${idOf(1)}`)).toEqual(body(50, 1));
    // The room is there again.
    expect((await put(cookie, idOf(2), body(50))).status).toBe(200);
    expect(await runBytes('alice')).toBe(100);
  });

  it('a stored size other than the declared one is not trusted: the object and its row go, the room comes back', async () => {
    const cookie = await signUp('alice');
    await ok(await put(cookie, idOf(1), body(50, 1)));
    expect((await put(cookie, idOf(1), body(70), { env: envOf({ FILES: faultyBucket({ putSize: 69 }) }) })).status).toBe(503);
    expect((await put(cookie, idOf(2), body(70), { env: envOf({ FILES: faultyBucket({ putSize: 69 }) }) })).status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await count('run_body')).toBe(0);
    expect(await runBytes('alice')).toBe(0);
  });

  it('a body shorter than its Content-Length never gets stored', async () => {
    const cookie = await signUp('alice');
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(body(10));
        ctl.close();
      },
    });
    const res = await put(cookie, idOf(1), body(0), { body: stream, headers: { 'content-length': '20' } });
    // The FixedLengthStream fails the put. (Miniflare's local R2 logs an
    // uncaught "Network connection lost" of its own here; the test passes.)
    expect(res.status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await runBytes('alice')).toBe(0);
  });

  it('a DELETE that R2 fails changes nothing (503)', async () => {
    const cookie = await signUp('alice');
    await ok(await put(cookie, idOf(1), body(50)));
    const res = await call('DELETE', runPath(idOf(1)), undefined, { cookie, env: envOf({ FILES: faultyBucket({ fail: ['delete'] }) }) });
    expect(res.status).toBe(503);
    expect(await runBytes('alice')).toBe(50);
    expect(await count('run_body')).toBe(1);
  });

  it('an upload that finishes after its account was deleted is removed again (401)', async () => {
    const cookie = await signUp('alice');
    const acc = await accountId('alice');
    const racing: R2 = {
      ...faultyBucket(),
      async put(key, value, options) {
        const head = await bucket.put(key, value, options);
        await db.prepare('DELETE FROM account WHERE id = ?1').bind(acc).run();
        return head;
      },
    };
    const res = await put(cookie, idOf(1), body(50), { env: envOf({ FILES: racing }) });
    expect(res.status).toBe(401);
    expect(await r2Keys()).toEqual([]);
    expect(await count('run_body')).toBe(0);
  });

  it('accounts are apart: another account neither reads, lists nor deletes the body', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = idOf(1);
    await ok(await put(alice, id, body(50)));
    expect((await call('GET', runPath(id), undefined, { cookie: bob })).status).toBe(404);
    expect((await list(bob)).bodies).toEqual([]);
    expect(await ok<RunBodyWritten>(await call('DELETE', runPath(id), undefined, { cookie: bob }))).toMatchObject({ usage: { runBytes: 0 } });
    expect((await call('GET', runPath(id), undefined, { cookie: alice })).status).toBe(200);
    // The same id in bob's account is a body of its own.
    await ok(await put(bob, id, body(20)));
    expect(await r2Keys()).toHaveLength(2);
    expect((await list(alice)).usage.runBytes).toBe(50);
    expect((await list(bob)).usage.runBytes).toBe(20);
  });
});

describe('the run bytes in every usage, and the limit', () => {
  it('SyncChanges, SyncWritten, the account and the run answers say the same runBytes', async () => {
    const cookie = await signUp('alice');
    await ok(await put(cookie, idOf(1), body(123)));
    const w = await ok<SyncWritten>(
      await call('PUT', `/api/u/sync/items/run/${idOf(1)}`, undefined, { cookie, headers: { 'content-type': 'application/octet-stream', 'if-match': '0' }, body: body(10) }),
    );
    expect(w.usage).toEqual({ items: 1, itemBytes: 10, runBytes: 123, lookImages: 0, lookBytes: 0 });
    const ch = await ok<SyncChanges>(await call('GET', '/api/u/sync/changes', undefined, { cookie }));
    expect(ch.usage).toEqual({ items: 1, itemBytes: 10, runBytes: 123, lookImages: 0, lookBytes: 0 });
    expect((await account(cookie)).usage).toEqual({ items: 1, itemBytes: 10, runBytes: 123, lookImages: 0, lookBytes: 0 });
    expect((await list(cookie)).usage).toEqual({ items: 1, itemBytes: 10, runBytes: 123, lookImages: 0, lookBytes: 0 });
  });

  it('RUN_BYTES_LIMIT sets the default runBytes: /api/config, the account, the list and the quota; an account’s own limit wins', async () => {
    const env = envOf({ RUN_BYTES_LIMIT: '200' });
    const cookie = await signUp('alice');
    const config = (await (await call('GET', '/api/config', undefined, { env })).json()) as { limits: unknown };
    expect(config.limits).toEqual({ ...DEFAULT_ACCOUNT_LIMITS, runBytes: 200 });
    expect((await account(cookie, env)).limits).toEqual({ ...DEFAULT_ACCOUNT_LIMITS, runBytes: 200 });
    expect((await list(cookie, env)).limits.runBytes).toBe(200);
    await ok(await put(cookie, idOf(1), body(150), { env }));
    expect(await errorOf(await put(cookie, idOf(2), body(51), { env }))).toEqual({ error: 'quota', used: 150, limit: 200, size: 51 });
    await setLimits({ runBytes: 300 });
    expect((await put(cookie, idOf(2), body(51), { env })).status).toBe(200);
    // A var that is not a whole number is ignored.
    const bad = envOf({ RUN_BYTES_LIMIT: 'lots' });
    expect(((await (await call('GET', '/api/config', undefined, { env: bad })).json()) as { limits: { runBytes: number } }).limits.runBytes).toBe(DEFAULT_ACCOUNT_LIMITS.runBytes);
    expect(((await (await call('GET', '/api/config', undefined, { env: envOf({ RUN_BYTES_LIMIT: 1000 }) })).json()) as { limits: { runBytes: number } }).limits.runBytes).toBe(1000);
  });
});

describe('Delete account and the R2 prefix', () => {
  const remove = (cookie: string, env = ENV): Promise<Response> => call('DELETE', '/api/u/account', { authKey: key(1) }, { cookie, env });

  it('empties the prefix and the run_body rows; another account keeps its bodies', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const aliceId = await accountId('alice');
    for (let i = 0; i < 5; i++) await ok(await put(alice, idOf(i), body(10 + i)));
    await ok(await put(bob, idOf(1), body(10)));
    expect((await remove(alice)).status).toBe(204);
    expect(await r2Keys(prefixOf(aliceId))).toEqual([]);
    expect(await r2Keys()).toHaveLength(1);
    expect(await count('run_body')).toBe(1);
    // The sweep row stays until the cron has looked again.
    expect(await count('r2_sweep')).toBe(1);
    await runCron(ENV, DAILY_CRON, NOW + SWEEP_AFTER_MS);
    expect(await count('r2_sweep')).toBe(0);
    expect((await list(bob)).bodies).toHaveLength(1);
  });

  it('an R2 failure half-way does not stop the delete; the daily cron empties the prefix later', async () => {
    const alice = await signUp('alice');
    const aliceId = await accountId('alice');
    for (let i = 0; i < 3; i++) await ok(await put(alice, idOf(i), body(10)));
    expect((await remove(alice, envOf({ FILES: faultyBucket({ fail: ['delete'] }) }))).status).toBe(204);
    expect(await count('account')).toBe(0);
    expect(await count('run_body')).toBe(0);
    expect(await r2Keys(prefixOf(aliceId))).toHaveLength(3);
    // Too soon: the row is not due.
    await runCron(ENV, DAILY_CRON, NOW + SWEEP_AFTER_MS - 1);
    expect(await r2Keys(prefixOf(aliceId))).toHaveLength(3);
    // R2 still failing: the row stays.
    await runCron(envOf({ FILES: faultyBucket({ fail: ['list'] }) }), DAILY_CRON, NOW + SWEEP_AFTER_MS);
    expect(await count('r2_sweep')).toBe(1);
    await runCron(ENV, DAILY_CRON, NOW + SWEEP_AFTER_MS);
    expect(await r2Keys(prefixOf(aliceId))).toEqual([]);
    expect(await count('r2_sweep')).toBe(0);
  });

  it('a wrong password deletes nothing in R2', async () => {
    const alice = await signUp('alice');
    await ok(await put(alice, idOf(1), body(10)));
    expect((await call('DELETE', '/api/u/account', { authKey: key(7) }, { cookie: alice })).status).toBe(401);
    expect(await r2Keys()).toHaveLength(1);
    expect(await count('run_body')).toBe(1);
    expect(await count('r2_sweep')).toBe(0);
  });

  it('emptyPrefix deletes in batches of 1000 and leaves other prefixes', async () => {
    const n = 1003;
    for (let i = 0; i < n; i += 100) await Promise.all(Array.from({ length: Math.min(100, n - i) }, (_, j) => bucket.put(`u/a/${i + j}`, 'x')));
    await bucket.put('u/ab/1', 'x');
    const counted = faultyBucket();
    expect(await emptyPrefix(counted, 'u/a/')).toBe(n);
    expect(counted.calls.delete).toBe(2);
    expect(await r2Keys('u/a/')).toEqual([]);
    expect(await r2Keys()).toEqual(['u/ab/1']);
  });
});

// Stage 63's review (ADR 0153, "As built (stage 63, review fixes)"): the
// Worker's two. run_body always names bodies R2 holds, and run_bytes is
// their sum.
describe('stage 63 review: finding 7, a DELETE racing a PUT of the same id', () => {
  it('the object gone under the PUT: its row and bytes go too (503, the client puts again)', async () => {
    const cookie = await signUp('alice');
    const id = idOf(1);
    await ok(await put(cookie, id, body(50, 1)));
    // Between the PUT's store and its row, a DELETE of the id (another tab's, another device's) runs whole.
    const racing: R2 = {
      ...faultyBucket(),
      async put(k, value, options) {
        const head = await bucket.put(k, value, options);
        expect((await call('DELETE', runPath(id), undefined, { cookie })).status).toBe(200);
        return head;
      },
    };
    const res = await put(cookie, id, body(70, 2), { env: envOf({ FILES: racing }) });
    expect(res.status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await count('run_body')).toBe(0);
    expect(await runBytes('alice')).toBe(0);
    // The client's retry stores it.
    await ok(await put(cookie, id, body(70, 2)));
    expect(await runBytes('alice')).toBe(70);
    expect((await list(cookie)).bodies.map((b) => b.size)).toEqual([70]);
  });
});

describe('stage 63 review: CR5, R2 took the object but the request’s stream failed', () => {
  it('the object is not trusted: it goes with its row and its bytes (503)', async () => {
    const cookie = await signUp('alice');
    const id = idOf(1);
    await ok(await put(cookie, id, body(50, 1)));
    // R2 stores the object and answers, while the stream that fed it fails (a cut connection after the put ended).
    const early: R2 = {
      ...faultyBucket(),
      async put(k, value, options) {
        const head = await bucket.put(k, body(70, 2), options);
        if (typeof (value as ReadableStream).cancel === 'function') await (value as ReadableStream).cancel(new Error('the connection was cut')).catch(() => {});
        return head;
      },
    };
    const res = await put(cookie, id, body(70, 2), { env: envOf({ FILES: early }) });
    expect(res.status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await count('run_body')).toBe(0);
    expect(await runBytes('alice')).toBe(0);
  });
});
