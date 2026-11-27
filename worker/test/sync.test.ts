// The sync endpoints (worker/sync.ts; the contract is the "Sync" part of
// shared/cloud/api.ts) and why a session ended (worker/sessions.ts), in
// workerd. Accounts are made through the real endpoints; Turnstile's
// siteverify is a stub that passes the token `ok`.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Account,
  DEFAULT_ACCOUNT_LIMITS,
  DEFAULT_KDF,
  SESSION_COOKIE,
  SESSION_SECONDS,
  type SessionEndReason,
  type SyncChanges,
  type SyncConflict,
  type SyncItem,
  type SyncWritten,
} from '../../shared/cloud/api.ts';
import { fromB64url, toB64url } from '../bytes.ts';
import { handle } from '../router.ts';
import type { Deps, Env } from '../runtime.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import { CHANGES_MAX_BYTES } from '../sync.ts';
import { T, at, count, db, emptyTables, envWith, realEnv } from './helpers.ts';

const ORIGIN = 'https://example.test';
const NOW = T('2026-11-14T12:00:00Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SESSION_MS = SESSION_SECONDS * 1000;

const ENV = envWith({ API_LIMITER: undefined, AUTH_LIMITER: undefined });

const bytes = (n: number, fill: number): string => toB64url(Uint8Array.from({ length: n }, (_, i) => (fill * 31 + i * 7) & 255));
const key = (seed: number): string => bytes(32, seed);
/** A blob of `n` bytes made from `fill`. */
const blob = (n: number, fill = 1): Uint8Array<ArrayBuffer> => Uint8Array.from({ length: n }, (_, i) => (fill * 13 + i) & 255);
/** An item id (22 characters of base64url) by number. */
const idOf = (n: number): string => toB64url(Uint8Array.from({ length: 16 }, (_, i) => (n * 17 + i) & 255));

const siteverify: Deps['fetch'] = async (_url, init) => {
  const token = (JSON.parse(init?.body ?? '{}') as { response?: unknown }).response;
  return Response.json(token === 'ok' ? { success: true, hostname: 'example.com', 'error-codes': [] } : { success: false, 'error-codes': ['invalid-input-response'] });
};

interface Opts {
  now?: number;
  env?: Env;
  cookie?: string;
  ip?: string;
  headers?: Record<string, string>;
  csrf?: boolean;
  body?: BodyInit;
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

function cookieOf(res: Response): string | null {
  const set = res.headers.get('set-cookie');
  if (set === null) return null;
  const first = set.split(';')[0] ?? '';
  return first === `${SESSION_COOKIE}=` ? '' : first;
}

let ips = 0;
/** Registers `name` (from an address of its own, so the registration limit never trips) and returns its cookie. */
async function signUp(name: string): Promise<string> {
  ips++;
  const res = await call(
    'POST',
    '/api/auth/register',
    { name, salt: bytes(16, 9), kdf: { ...DEFAULT_KDF }, authKey: key(1), recoveryAuth: key(2), wrapPw: bytes(61, 3), wrapRc: bytes(61, 4), label: 'Firefox on Linux', turnstile: 'ok' },
    { ip: `198.51.100.${ips}` },
  );
  expect(res.status, `register ${name}`).toBe(201);
  return cookieOf(res) as string;
}

async function login(name: string, seed = 1, now = NOW): Promise<string> {
  const res = await call('POST', '/api/auth/login', { name, authKey: key(seed), label: 'Chrome on Android' }, { now });
  expect(res.status).toBe(200);
  return cookieOf(res) as string;
}

const itemPath = (kind: string, id: string): string => `/api/u/sync/items/${kind}/${id}`;

/** PUT a blob over rev `base` (null: no If-Match). */
function put(cookie: string, kind: string, id: string, base: number | string | null, body: Uint8Array<ArrayBuffer>, o: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream', ...o.headers };
  if (base !== null) headers['if-match'] = String(base);
  return call('PUT', itemPath(kind, id), undefined, { ...o, cookie, headers, body });
}

function del(cookie: string, kind: string, id: string, base: number | null, o: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = { ...o.headers };
  if (base !== null) headers['if-match'] = String(base);
  return call('DELETE', itemPath(kind, id), undefined, { ...o, cookie, headers });
}

async function written(res: Response): Promise<SyncWritten> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as SyncWritten;
}

async function changes(cookie: string, query = '', o: Opts = {}): Promise<SyncChanges> {
  const res = await call('GET', `/api/u/sync/changes${query}`, undefined, { ...o, cookie });
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as SyncChanges;
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

async function account(cookie: string): Promise<Account> {
  const res = await call('GET', '/api/u/account', undefined, { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { account: Account }).account;
}

async function setLimits(limits: Record<string, number>): Promise<void> {
  await db.prepare('UPDATE account SET limits = ?1').bind(JSON.stringify(limits)).run();
}

beforeEach(async () => {
  await emptyTables();
});

describe('the flag sync', () => {
  it('off: every sync path answers 404 not_found; the account endpoints still answer', async () => {
    const cookie = await signUp('alice');
    const off = envWith({ API_LIMITER: undefined, AUTH_LIMITER: undefined, FLAG_SYNC: false });
    for (const [method, path] of [
      ['GET', '/api/u/sync/changes'],
      ['PUT', itemPath('profile', idOf(1))],
      ['DELETE', itemPath('profile', idOf(1))],
      ['GET', itemPath('profile', idOf(1))],
    ] as const) {
      const res = await call(method, path, undefined, { cookie, env: off, headers: { 'if-match': '0' }, ...(method === 'PUT' ? { body: blob(10) } : {}) });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    expect(await count('item')).toBe(0);
    expect((await call('GET', '/api/u/account', undefined, { cookie, env: off })).status).toBe(200);
    // The var's default, and /api/config says it.
    const config = (await (await call('GET', '/api/config', undefined, { env: off })).json()) as { flags: Record<string, boolean> };
    expect(config.flags.sync).toBe(false);
    expect(((await (await call('GET', '/api/config')).json()) as { flags: Record<string, boolean> }).flags.sync).toBe(true);
  });

  it('the flag accounts off closes sync too', async () => {
    const cookie = await signUp('alice');
    const res = await call('GET', '/api/u/sync/changes', undefined, { cookie, env: envWith({ FLAG_ACCOUNTS: false }) });
    expect(res.status).toBe(404);
  });

  it('needs a session: none is 401 unauthorized', async () => {
    expect(await errorOf(await call('GET', '/api/u/sync/changes'))).toBe('unauthorized');
    expect((await put(`${SESSION_COOKIE}=${bytes(32, 5)}`, 'profile', idOf(1), 0, blob(10))).status).toBe(401);
  });
});

describe('PUT and DELETE /api/u/sync/items/<kind>/<id>', () => {
  it('a new item: rev 1, the next seq, the usage; the pull has it with its blob', async () => {
    const cookie = await signUp('alice');
    const id = idOf(1);
    const w = await written(await put(cookie, 'profile', id, 0, blob(100)));
    expect(w).toEqual({ rev: 1, seq: 1, usage: { items: 1, itemBytes: 100, runBytes: 0, lookImages: 0, lookBytes: 0 } });
    const c = await changes(cookie);
    expect(c).toEqual({
      items: [{ kind: 'profile', id, rev: 1, seq: 1, deleted: false, size: 100, updated: NOW, blob: toB64url(blob(100)) }],
      cursor: 1,
      more: false,
      usage: { items: 1, itemBytes: 100, runBytes: 0, lookImages: 0, lookBytes: 0 },
      limits: DEFAULT_ACCOUNT_LIMITS,
    });
    expect(fromB64url(c.items[0]?.blob as string)).toEqual(blob(100));
    // The Account page counts it.
    expect((await account(cookie)).usage).toEqual({ items: 1, itemBytes: 100, runBytes: 0, lookImages: 0, lookBytes: 0 });
  });

  it('an update on the right rev; a stale rev is 409 with the current item; If-Match 0 on an existing item too', async () => {
    const cookie = await signUp('alice');
    const id = idOf(1);
    await written(await put(cookie, 'script', id, 0, blob(10, 1)));
    const w = await written(await put(cookie, 'script', id, 1, blob(20, 2), { now: NOW + MIN }));
    expect(w).toEqual({ rev: 2, seq: 2, usage: { items: 1, itemBytes: 20, runBytes: 0, lookImages: 0, lookBytes: 0 } });
    const current: SyncItem = { kind: 'script', id, rev: 2, seq: 2, deleted: false, size: 20, updated: NOW + MIN, blob: toB64url(blob(20, 2)) };
    for (const base of [1, 0, 3, 99]) {
      const res = await put(cookie, 'script', id, base, blob(30, 3));
      expect(res.status, `base ${base}`).toBe(409);
      expect(await res.json()).toEqual({ error: 'conflict', current } satisfies SyncConflict);
    }
    // An ETag's quotes are allowed.
    expect(await written(await put(cookie, 'script', id, '"2"', blob(5, 4)))).toMatchObject({ rev: 3, seq: 3 });
    expect((await changes(cookie)).items).toHaveLength(1);
  });

  it('If-Match: missing is 428 if_match_required, not a rev is 400; nothing is written', async () => {
    const cookie = await signUp('alice');
    const missing = await put(cookie, 'profile', idOf(1), null, blob(10));
    expect(missing.status).toBe(428);
    expect(await missing.json()).toEqual({ error: 'if_match_required' });
    expect(await errorOf(await del(cookie, 'profile', idOf(1), null))).toBe('if_match_required');
    for (const bad of ['', '*', '-1', '1.5', 'W/"1"', 'abc', '1234567890123456']) {
      const res = await put(cookie, 'profile', idOf(1), bad, blob(10));
      expect(res.status, `If-Match ${bad}`).toBe(400);
    }
    expect(await count('item')).toBe(0);
  });

  it('a base rev for an item that does not exist, or a delete of one, is 409 with a tombstone of rev 0', async () => {
    const cookie = await signUp('alice');
    const tomb0: SyncItem = { kind: 'profile', id: idOf(1), rev: 0, seq: 0, deleted: true, size: 0, updated: 0 };
    for (const res of [await put(cookie, 'profile', idOf(1), 3, blob(10)), await del(cookie, 'profile', idOf(1), 0), await del(cookie, 'profile', idOf(1), 1)]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'conflict', current: tomb0 } satisfies SyncConflict);
    }
    expect(await count('item')).toBe(0);
  });

  it('a conflict is answered before a 413', async () => {
    const cookie = await signUp('alice');
    const max = DEFAULT_ACCOUNT_LIMITS.itemMaxBytes;
    const tooBig = await put(cookie, 'profile', idOf(1), 2, blob(max + 1));
    expect(tooBig.status).toBe(409);
    expect(await tooBig.json()).toMatchObject({ error: 'conflict', current: { rev: 0, deleted: true } });
    await written(await put(cookie, 'profile', idOf(1), 0, blob(10)));
    const stale = await put(cookie, 'profile', idOf(1), 0, blob(max + 1));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: 'conflict', current: { rev: 1 } });
    await setLimits({ items: 1 });
    const many = await put(cookie, 'profile', idOf(2), 5, blob(10));
    expect(many.status).toBe(409);
  });

  it('a delete is a tombstone: rev + 1, no blob, kept; a second delete writes nothing; a write over it brings it back', async () => {
    const cookie = await signUp('alice');
    const id = idOf(1);
    await written(await put(cookie, 'profile', id, 0, blob(50)));
    const d = await written(await del(cookie, 'profile', id, 1, { now: NOW + MIN }));
    expect(d).toEqual({ rev: 2, seq: 2, usage: { items: 0, itemBytes: 0, runBytes: 0, lookImages: 0, lookBytes: 0 } });
    const tomb: SyncItem = { kind: 'profile', id, rev: 2, seq: 2, deleted: true, size: 0, updated: NOW + MIN };
    expect((await changes(cookie)).items).toEqual([tomb]);
    expect(await db.prepare('SELECT blob FROM item').first()).toEqual({ blob: null });

    // Again on the tombstone's rev: the same answer, nothing written.
    expect(await written(await del(cookie, 'profile', id, 2, { now: NOW + 2 * MIN }))).toEqual(d);
    expect((await changes(cookie)).items).toEqual([tomb]);
    // A stale delete or write gets the tombstone as the current item.
    for (const res of [await del(cookie, 'profile', id, 1), await put(cookie, 'profile', id, 1, blob(5))]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'conflict', current: tomb });
    }
    // A write on the tombstone's rev brings it back (an edit beats a delete, client side).
    expect(await written(await put(cookie, 'profile', id, 2, blob(7)))).toEqual({ rev: 3, seq: 3, usage: { items: 1, itemBytes: 7, runBytes: 0, lookImages: 0, lookBytes: 0 } });
    // Tombstones stay for good: the daily cron leaves them.
    await written(await del(cookie, 'profile', id, 3));
    await runCron(realEnv, DAILY_CRON, T('2028-01-01T00:10:00Z'));
    expect(await count('item')).toBe(1);
  });

  it('the small kinds of stage 62 are open: a write, a change, a delete of each (ADR 0152)', async () => {
    const cookie = await signUp('alice');
    const kinds = ['settings', 'scriptData', 'comm', 'timers'];
    for (const [i, kind] of kinds.entries()) {
      expect(await written(await put(cookie, kind, idOf(i + 1), 0, blob(20 + i, i)))).toMatchObject({ rev: 1, seq: i + 1 });
    }
    const ch = await changes(cookie, '?since=0');
    expect(ch.items.map((x) => [x.kind, x.id, x.rev, x.size, x.blob])).toEqual(kinds.map((k, i) => [k, idOf(i + 1), 1, 20 + i, toB64url(blob(20 + i, i))]));
    expect(ch.usage).toEqual({ items: 4, itemBytes: 20 + 21 + 22 + 23, runBytes: 0, lookImages: 0, lookBytes: 0 });
    // A stale write conflicts as for any kind; a write on the rev replaces; a delete makes a tombstone.
    expect((await put(cookie, 'comm', idOf(3), 0, blob(5))).status).toBe(409);
    expect(await written(await put(cookie, 'comm', idOf(3), 1, blob(30, 9)))).toMatchObject({ rev: 2, seq: 5 });
    expect(await written(await del(cookie, 'timers', idOf(4), 1))).toMatchObject({ rev: 2, seq: 6, usage: { items: 3 } });
    const after = await changes(cookie, '?since=4');
    expect(after.items.map((x) => [x.kind, x.rev, x.deleted])).toEqual([
      ['comm', 2, false],
      ['timers', 2, true],
    ]);
  });

  it('the kind and the id: open kinds only (kind_closed), known kinds, an id of the pattern', async () => {
    const cookie = await signUp('alice');
    for (const kind of ['run', 'exportDoc']) {
      const res = await put(cookie, kind, idOf(1), 0, blob(10));
      expect(res.status, kind).toBe(403);
      expect(await res.json()).toEqual({ error: 'kind_closed' });
      expect(await errorOf(await del(cookie, kind, idOf(1), 0))).toBe('kind_closed');
    }
    for (const path of [
      itemPath('Profile', idOf(1)),
      itemPath('nonsense', idOf(1)),
      itemPath('profile', 'short'),
      itemPath('profile', `${idOf(1)}A`),
      itemPath('profile', 'a+bcdefghijklmnopqrstu'),
      itemPath('profile', '%27%20OR%201=1--aaaaaaa'),
      `${itemPath('profile', idOf(1))}/more`,
      '/api/u/sync/items/profile',
    ]) {
      const res = await call('PUT', path, undefined, { cookie, headers: { 'if-match': '0', 'content-type': 'application/octet-stream' }, body: blob(10) });
      expect(res.status, path).toBe(400);
    }
    for (const path of ['/api/u/sync', '/api/u/sync/', '/api/u/sync/items/', '/api/u/sync/other']) {
      expect((await call('GET', path, undefined, { cookie })).status, path).toBe(404);
    }
    const wrong = await call('GET', itemPath('profile', idOf(1)), undefined, { cookie });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('PUT, DELETE');
    expect((await call('POST', '/api/u/sync/changes', undefined, { cookie })).status).toBe(405);
    expect(await count('item')).toBe(0);
  });

  it('the body: application/octet-stream, not empty; the CSRF rule as on every /api/u/ route', async () => {
    const cookie = await signUp('alice');
    const id = idOf(1);
    for (const type of [null, 'application/json', 'text/plain']) {
      const headers: Record<string, string> = { 'if-match': '0' };
      if (type) headers['content-type'] = type;
      const res = await call('PUT', itemPath('profile', id), undefined, { cookie, headers, body: blob(10) });
      expect(res.status, String(type)).toBe(400);
    }
    expect((await put(cookie, 'profile', id, 0, new Uint8Array(0))).status).toBe(400);
    expect((await put(cookie, 'profile', id, 0, blob(10), { csrf: false })).status).toBe(403);
    expect((await del(cookie, 'profile', id, 0, { csrf: false })).status).toBe(403);
    expect((await put(cookie, 'profile', id, 0, blob(10), { headers: { 'content-type': 'Application/Octet-Stream; x=1' } })).status).toBe(200);
  });
});

describe('the limits', () => {
  it('one item: at most itemMaxBytes, else 413 item_too_large', async () => {
    const cookie = await signUp('alice');
    const max = DEFAULT_ACCOUNT_LIMITS.itemMaxBytes;
    const res = await put(cookie, 'profile', idOf(1), 0, blob(max + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'item_too_large' });
    expect(await count('item')).toBe(0);
    expect(await written(await put(cookie, 'profile', idOf(1), 0, blob(max)))).toMatchObject({ usage: { items: 1, itemBytes: max } });
    // The account's own limit.
    await setLimits({ itemMaxBytes: 10 });
    expect(await errorOf(await put(cookie, 'profile', idOf(2), 0, blob(11)))).toBe('item_too_large');
  });

  it('all items: at most itemBytes, else 413 storage_full; a write that shrinks and a delete always go through', async () => {
    const cookie = await signUp('alice');
    await setLimits({ itemBytes: 100 });
    await written(await put(cookie, 'profile', idOf(1), 0, blob(60)));
    const full = await put(cookie, 'profile', idOf(2), 0, blob(41));
    expect(full.status).toBe(413);
    expect(await full.json()).toEqual({ error: 'storage_full' });
    // Growing an item past the limit is refused, to the limit is fine.
    expect(await errorOf(await put(cookie, 'profile', idOf(1), 1, blob(101)))).toBe('storage_full');
    await written(await put(cookie, 'profile', idOf(2), 0, blob(40)));
    // Over the limit (the owner lowered it): shrinking and deleting still work, growing not.
    await setLimits({ itemBytes: 50 });
    expect(await written(await put(cookie, 'profile', idOf(1), 1, blob(55)))).toMatchObject({ usage: { itemBytes: 95 } });
    expect(await errorOf(await put(cookie, 'profile', idOf(1), 2, blob(56)))).toBe('storage_full');
    expect(await written(await del(cookie, 'profile', idOf(2), 1))).toMatchObject({ usage: { items: 1, itemBytes: 55 } });
    expect((await changes(cookie)).usage).toEqual({ items: 1, itemBytes: 55, runBytes: 0, lookImages: 0, lookBytes: 0 });
  });

  it('live items: at most `items`, else 413 too_many_items; tombstones do not count', async () => {
    const cookie = await signUp('alice');
    await setLimits({ items: 2 });
    await written(await put(cookie, 'profile', idOf(1), 0, blob(5)));
    await written(await put(cookie, 'script', idOf(2), 0, blob(5)));
    const res = await put(cookie, 'script', idOf(3), 0, blob(5));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_many_items' });
    // Updates of the two are fine.
    await written(await put(cookie, 'profile', idOf(1), 1, blob(6)));
    // A delete makes room; the tombstone is not counted.
    await written(await del(cookie, 'profile', idOf(1), 2));
    expect(await written(await put(cookie, 'script', idOf(3), 0, blob(5)))).toMatchObject({ usage: { items: 2, itemBytes: 10 } });
    // Bringing the tombstone back would be a third.
    expect(await errorOf(await put(cookie, 'profile', idOf(1), 3, blob(5)))).toBe('too_many_items');
    expect(await count('item')).toBe(3);
  });

  it('the answers carry the limits of the account', async () => {
    const cookie = await signUp('alice');
    await setLimits({ items: 7 });
    expect((await changes(cookie)).limits).toEqual({ ...DEFAULT_ACCOUNT_LIMITS, items: 7 });
  });
});

describe('GET /api/u/sync/changes', () => {
  it('pages oldest first with `more`; the cursor only grows; a changed item moves to the end', async () => {
    const cookie = await signUp('alice');
    const ids = [1, 2, 3, 4, 5].map(idOf);
    for (const [i, id] of ids.entries()) await written(await put(cookie, 'profile', id, 0, blob(10 + i, i)));
    // An item written again gets a new seq; its old place is gone.
    await written(await put(cookie, 'profile', ids[1] as string, 1, blob(3)));

    const empty = await changes(cookie, '?since=6');
    expect(empty).toMatchObject({ items: [], cursor: 6, more: false });
    expect((await changes(cookie, '?since=100')).cursor).toBe(100);

    const seen: SyncItem[] = [];
    let since = 0;
    const pages: number[] = [];
    for (;;) {
      const page = await changes(cookie, `?since=${since}&limit=2`);
      expect(page.cursor).toBeGreaterThan(since);
      seen.push(...page.items);
      pages.push(page.items.length);
      since = page.cursor;
      if (!page.more) break;
    }
    expect(pages).toEqual([2, 2, 1]);
    expect(since).toBe(6);
    expect(seen.map((i) => i.seq)).toEqual([1, 3, 4, 5, 6]);
    expect(seen.map((i) => i.id)).toEqual([ids[0], ids[2], ids[3], ids[4], ids[1]]);
    expect(seen.at(-1)).toMatchObject({ rev: 2, size: 3, blob: toB64url(blob(3)) });
    // The default (and largest) page is 500.
    expect((await changes(cookie, '?limit=100000')).items).toHaveLength(5);
  });

  it('since and limit must be whole numbers; limit at least 1', async () => {
    const cookie = await signUp('alice');
    for (const q of ['?since=-1', '?since=x', '?since=1.5', '?since=', '?limit=0', '?limit=-3', '?limit=a']) {
      const res = await call('GET', `/api/u/sync/changes${q}`, undefined, { cookie });
      expect(res.status, q).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_request' });
    }
  });

  it('an answer stops before the blobs pass CHANGES_MAX_BYTES, with at least one item', async () => {
    const cookie = await signUp('alice');
    const mb = 1024 * 1024;
    await setLimits({ itemBytes: 20 * mb, itemMaxBytes: 2 * mb });
    for (let i = 1; i <= 5; i++) await written(await put(cookie, 'profile', idOf(i), 0, blob(mb, i)));
    const first = await changes(cookie);
    expect(first.items).toHaveLength(Math.floor(CHANGES_MAX_BYTES / mb));
    expect(first.more).toBe(true);
    const rest = await changes(cookie, `?since=${first.cursor}`);
    expect(rest.items).toHaveLength(5 - first.items.length);
    expect(rest.more).toBe(false);
    expect(fromB64url(rest.items.at(-1)?.blob as string)).toEqual(blob(mb, 5));
    // An item bigger than the cap still comes, alone.
    await setLimits({ itemBytes: 50 * mb, itemMaxBytes: 5 * mb });
    await written(await put(cookie, 'script', idOf(9), 0, blob(CHANGES_MAX_BYTES + 1)));
    await written(await put(cookie, 'script', idOf(10), 0, blob(10)));
    const big = await changes(cookie, `?since=${rest.cursor}`);
    expect(big.items.map((i) => i.size)).toEqual([CHANGES_MAX_BYTES + 1]);
    expect(big.more).toBe(true);
  }, 30_000); // several MB through D1: slow on a CI runner

  it('seq is strictly increasing over every write of an account, racing writes included', async () => {
    const cookie = await signUp('alice');
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => put(cookie, n % 2 ? 'profile' : 'script', idOf(n), 0, blob(n))));
    const seqs = (await Promise.all(results.map(written))).map((w) => w.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await changes(cookie)).usage).toEqual({ items: 6, itemBytes: 21, runBytes: 0, lookImages: 0, lookBytes: 0 });
    // Two writes on the same base: one wins, the other gets the winner.
    const [a, b] = await Promise.all([put(cookie, 'profile', idOf(1), 1, blob(2, 7)), put(cookie, 'profile', idOf(1), 1, blob(3, 8))]);
    const statuses = [a?.status, b?.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = (a?.status === 409 ? a : b) as Response;
    expect(((await loser.json()) as SyncConflict).current).toMatchObject({ rev: 2, seq: 7 });
    expect(await db.prepare('SELECT seq, item_count, item_bytes FROM account').first()).toMatchObject({ seq: 7 });
  });
});

describe('accounts are apart', () => {
  it('another account neither sees nor writes the items', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = idOf(1);
    await written(await put(alice, 'profile', id, 0, blob(10, 1)));
    expect(await changes(bob)).toMatchObject({ items: [], cursor: 0, usage: { items: 0, itemBytes: 0 } });
    // Bob's rev 1 is not Alice's: his item of the same kind and id is his own.
    for (const res of [await put(bob, 'profile', id, 1, blob(10, 2)), await del(bob, 'profile', id, 1)]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ current: { rev: 0, deleted: true } });
    }
    expect(await written(await put(bob, 'profile', id, 0, blob(4, 3)))).toEqual({ rev: 1, seq: 1, usage: { items: 1, itemBytes: 4, runBytes: 0, lookImages: 0, lookBytes: 0 } });
    expect((await changes(alice)).items).toEqual([expect.objectContaining({ rev: 1, size: 10, blob: toB64url(blob(10, 1)) })]);
    expect((await changes(bob)).items).toEqual([expect.objectContaining({ rev: 1, size: 4, blob: toB64url(blob(4, 3)) })]);
  });

  it('DELETE /api/u/account removes its items and leaves the others', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await written(await put(alice, 'profile', idOf(1), 0, blob(10)));
    await written(await put(alice, 'script', idOf(2), 0, blob(10)));
    await written(await del(alice, 'script', idOf(2), 1));
    await written(await put(bob, 'profile', idOf(1), 0, blob(10)));
    expect(await count('item')).toBe(3);
    expect((await call('DELETE', '/api/u/account', { authKey: key(1) }, { cookie: alice })).status).toBe(204);
    expect(await count('item')).toBe(1);
    expect((await changes(bob)).items).toHaveLength(1);
  });
});

describe('why a session ended', () => {
  const ended = async (cookie: string, now = NOW): Promise<unknown> => {
    const res = await call('GET', '/api/u/sync/changes', undefined, { cookie, now });
    expect(res.status).toBe(401);
    expect(cookieOf(res)).toBe('');
    return res.json();
  };
  const reason = (r: SessionEndReason): unknown => ({ error: 'session_ended', reason: r });
  const ids = async (cookie: string): Promise<string[]> => (await account(cookie)).sessions.map((s) => s.id);

  it('logout', async () => {
    const cookie = await signUp('alice');
    expect((await call('POST', '/api/u/auth/logout', undefined, { cookie })).status).toBe(204);
    expect(await ended(cookie)).toEqual(reason('logout'));
    // On every /api/u/ route, whatever the method.
    const res = await call('DELETE', '/api/u/account', { authKey: key(1) }, { cookie });
    expect(await res.json()).toEqual(reason('logout'));
  });

  it('a password change ends the others with `password`', async () => {
    const here = await signUp('alice');
    const there = await login('alice');
    const set = { salt: bytes(16, 21), kdf: { ...DEFAULT_KDF }, authKey: key(22), wrapPw: bytes(61, 23) };
    expect((await call('POST', '/api/u/account/password', { authKey: key(1), set }, { cookie: here })).status).toBe(204);
    expect(await ended(there)).toEqual(reason('password'));
    expect((await call('GET', '/api/u/sync/changes', undefined, { cookie: here })).status).toBe(200);
  });

  it('a wrong password ends nothing', async () => {
    const here = await signUp('alice');
    const there = await login('alice');
    const set = { salt: bytes(16, 21), kdf: { ...DEFAULT_KDF }, authKey: key(22), wrapPw: bytes(61, 23) };
    expect((await call('POST', '/api/u/account/password', { authKey: key(9), set }, { cookie: here })).status).toBe(401);
    expect((await call('GET', '/api/u/sync/changes', undefined, { cookie: there })).status).toBe(200);
    expect(await count('session_end')).toBe(0);
  });

  it('recovery ends every older session with `recovered`', async () => {
    const a = await signUp('alice');
    const b = await login('alice');
    const first = await call('POST', '/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' });
    const { ticket } = (await first.json()) as { ticket: string };
    const set = { salt: bytes(16, 31), kdf: { ...DEFAULT_KDF }, authKey: key(32), wrapPw: bytes(61, 33) };
    const second = await call('POST', '/api/auth/recover', { name: 'alice', recoveryAuth: key(2), set, label: 'x', ticket });
    expect(second.status).toBe(200);
    for (const c of [a, b]) expect(await ended(c)).toEqual(reason('recovered'));
    expect((await call('GET', '/api/u/sync/changes', undefined, { cookie: cookieOf(second) as string })).status).toBe(200);
  });

  it('ended from the Account page, one or all the others: `ended`', async () => {
    const a1 = await signUp('alice');
    const a2 = await login('alice', 1, NOW + 1000);
    const a3 = await login('alice', 1, NOW + 2000);
    const [, id2] = (await ids(a1)) as [string, string, string];
    expect((await call('DELETE', `/api/u/account/sessions/${id2}`, undefined, { cookie: a1 })).status).toBe(204);
    expect(await ended(a2)).toEqual(reason('ended'));
    expect((await call('DELETE', '/api/u/account/sessions/others', undefined, { cookie: a3 })).status).toBe(204);
    expect(await ended(a1)).toEqual(reason('ended'));
    expect((await call('GET', '/api/u/sync/changes', undefined, { cookie: a3 })).status).toBe(200);
    // Another account's session id ends nothing and writes nothing.
    const bob = await signUp('bob');
    const [bobId] = (await ids(bob)) as [string];
    expect((await call('DELETE', `/api/u/account/sessions/${bobId}`, undefined, { cookie: a3 })).status).toBe(404);
    expect(await count('session_end')).toBe(2);
  });

  it('account deleted: every session `deleted`', async () => {
    const a = await signUp('alice');
    const b = await login('alice');
    expect((await call('DELETE', '/api/u/account', { authKey: key(1) }, { cookie: a })).status).toBe(204);
    for (const c of [a, b]) expect(await ended(c)).toEqual(reason('deleted'));
  });

  it('expired: by the clock at once, and still after the cron removed the session; the reasons go after a session could live', async () => {
    const cookie = await signUp('alice');
    const end = NOW + SESSION_MS;
    expect(await ended(cookie, end)).toEqual(reason('expired'));
    expect(await count('session')).toBe(1);
    const cron = T('2027-05-14T00:10:00Z');
    expect(cron).toBeGreaterThan(end);
    await runCron(realEnv, DAILY_CRON, cron);
    expect(await count('session')).toBe(0);
    expect(await db.prepare('SELECT reason, at FROM session_end').first()).toEqual({ reason: 'expired', at: end });
    expect(await ended(cookie, cron)).toEqual(reason('expired'));

    // A logout's reason is kept SESSION_SECONDS, then pruned; the cookie is then unknown.
    const other = await login('alice', 1, cron);
    expect((await call('POST', '/api/u/auth/logout', undefined, { cookie: other, now: cron })).status).toBe(204);
    await runCron(realEnv, DAILY_CRON, cron + SESSION_MS - DAY);
    expect(await ended(other, cron + SESSION_MS - DAY)).toEqual(reason('logout'));
    await runCron(realEnv, DAILY_CRON, cron + SESSION_MS);
    expect(await count('session_end')).toBe(0);
    expect(await ended(other, cron + SESSION_MS)).toEqual({ error: 'unauthorized' });
  });

  it('a cookie the server never knew stays `unauthorized`', async () => {
    expect(await ended(`${SESSION_COOKIE}=${bytes(32, 5)}`)).toEqual({ error: 'unauthorized' });
  });
});
