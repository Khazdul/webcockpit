// Published runs (worker/pub.ts; the contract is "Share links" in
// shared/cloud/api.ts, ADR 0154), in workerd with a local D1 and R2. The
// test Worker has the flag `share` off (as production); these tests turn
// it on through the env.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS, type MyPub, PUB_ID_PATTERN, type PubMeta, type PubWritten } from '../../shared/cloud/api.ts';
import { PENDING_STALE_MS, newPubId } from '../pub.ts';
import type { R2 } from '../runtime.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import { bucket, count, db, device, emptyTables, envWith, faultyBucket, r2Keys } from './helpers.ts';
import {
  AUTH_KEY,
  DAY,
  ENV,
  META,
  NOW,
  accountRow,
  call,
  envOf,
  ok,
  payload,
  post,
  pubBody,
  pubRow,
  publish,
  reportOf,
  setLimits,
  signUp,
} from './share-helpers.ts';

async function stored(key: string): Promise<Uint8Array | null> {
  const obj = await bucket.get(key);
  return obj ? new Uint8Array(await new Response(obj.body).arrayBuffer()) : null;
}

const meta = (id: string, o: { cookie?: string; now?: number } = {}): Promise<Response> => call('GET', `/api/pub/${id}`, undefined, o);
const payloadOf = (id: string): Promise<Response> => call('GET', `/api/pub/${id}/payload`);
const view = (id: string, dev: string, now = NOW): Promise<Response> => call('POST', `/api/pub/${id}/view`, { device: dev }, { now, csrf: false });

beforeEach(async () => {
  await emptyTables();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the flag share', () => {
  it('off: every pub and report path answers 404 not_found', async () => {
    const cookie = await signUp('alice');
    const id = await publish(cookie);
    const off = envWith({ API_LIMITER: undefined, AUTH_LIMITER: undefined });
    for (const [method, path] of [
      ['GET', '/api/u/pub'],
      ['POST', '/api/u/pub'],
      ['GET', `/api/u/pub/${id}`],
      ['GET', `/api/u/pub/${id}/payload`],
      ['PATCH', `/api/u/pub/${id}`],
      ['DELETE', `/api/u/pub/${id}`],
      ['POST', '/api/u/report'],
      ['GET', `/api/pub/${id}`],
      ['GET', `/api/pub/${id}/payload`],
      ['POST', `/api/pub/${id}/view`],
    ] as const) {
      const res = await call(method, path, method === 'GET' ? undefined : {}, { cookie, env: off });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    // Nothing was changed by them.
    expect((await pubRow(id))?.state).toBe('active');
  });
});

describe('POST /api/u/pub', () => {
  it('stores the payload byte for byte, reserves the count and answers PubWritten', async () => {
    const cookie = await signUp('alice');
    const data = payload(1234, 7);
    const res = await post(cookie, META, data);
    const { pub } = await ok<PubWritten>(res);
    expect(pub).toEqual({
      id: expect.stringMatching(PUB_ID_PATTERN),
      title: META.title,
      description: META.description,
      character: 'Olev',
      level: 26,
      lengthS: 93.5,
      listed: false,
      state: 'active',
      created: NOW,
      updated: NOW,
      views: 0,
      bytes: 1234,
    } satisfies MyPub);
    expect(await stored(`pub/${pub.id}`)).toEqual(data);
    expect(await r2Keys()).toEqual([`pub/${pub.id}`]);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 1, pub_bytes: 1234 });
    // Not counted against the run bytes.
    const account = (await ok<{ account: { usage: { runBytes: number } } }>(await call('GET', '/api/u/account', undefined, { cookie }))).account;
    expect(account.usage.runBytes).toBe(0);
    // Without a level the field is absent.
    const { level: _l, ...noLevel } = META;
    const second = await ok<PubWritten>(await post(cookie, noLevel));
    expect('level' in second.pub).toBe(false);
  });

  it('needs the rules ticked (403 rules), and nothing is kept', async () => {
    const cookie = await signUp('alice', { rules: false });
    const res = await post(cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'rules' });
    expect(await count('publication')).toBe(0);
    await call('PATCH', '/api/u/account/prefs', { rulesAccepted: true }, { cookie });
    await ok(await post(cookie));
  });

  it('a suspended account cannot publish or edit (403 suspended), but can remove', async () => {
    const cookie = await signUp('alice');
    const id = await publish(cookie);
    await db.prepare("UPDATE account SET state = 'suspended'").run();
    const res = await post(cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'suspended' });
    expect((await call('PATCH', `/api/u/pub/${id}`, { title: 'x' }, { cookie })).status).toBe(403);
    expect((await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie })).status).toBe(204);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
  });

  it('411 without Content-Length; 400 for another type, a body too short, no session 401, no X-WC 403', async () => {
    const cookie = await signUp('alice');
    const b = pubBody(META, payload(100));
    expect((await call('POST', '/api/u/pub', undefined, { cookie, headers: { 'content-type': 'application/octet-stream' }, body: b })).status).toBe(411);
    expect((await post(cookie, META, payload(100), { headers: { 'content-type': 'application/json' } })).status).toBe(400);
    expect((await post(cookie, META, payload(100), { headers: { 'content-length': 'x' } })).status).toBe(400);
    expect((await post(cookie, META, payload(100), { headers: { 'content-length': '3' }, body: new Uint8Array(3) })).status).toBe(400);
    expect((await post('', META, payload(100))).status).toBe(401);
    expect((await post(cookie, META, payload(100), { csrf: false })).status).toBe(403);
    expect(await count('publication')).toBe(0);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
  });

  it('413 payload_too_large with the limit: the default 5 MiB, and the account’s own', async () => {
    const cookie = await signUp('alice');
    // The declared length alone is refused before anything is read.
    const huge = await post(cookie, META, payload(10), { headers: { 'content-length': String(4 + 8192 + DEFAULT_ACCOUNT_LIMITS.payloadMaxBytes + 1) } });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: 'payload_too_large', limit: 5 * 1024 * 1024 });
    await setLimits('alice', { payloadMaxBytes: 100 });
    await ok(await post(cookie, META, payload(100)));
    const res = await post(cookie, META, payload(101));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large', limit: 100 });
    expect(await accountRow('alice')).toMatchObject({ pub_count: 1, pub_bytes: 100 });
    expect(await count('publication')).toBe(1);
  });

  it('400 for a payload that is not gzip', async () => {
    const cookie = await signUp('alice');
    const plain = new TextEncoder().encode('{"schema":1}');
    expect((await post(cookie, META, plain)).status).toBe(400);
    expect((await post(cookie, META, Uint8Array.of(0x1f))).status).toBe(400);
    expect((await post(cookie, META, Uint8Array.of(0x1f, 0x8c, 0))).status).toBe(400);
    expect(await count('publication')).toBe(0);
    expect(await r2Keys()).toEqual([]);
  });

  it('400 for bad meta: control characters, lengths, not NFC, untrimmed, bidi overrides, listed, unknown keys, bad numbers', async () => {
    const cookie = await signUp('alice');
    const bad: unknown[] = [
      { ...META, title: '' },
      { ...META, title: 'x'.repeat(101) },
      { ...META, title: ' padded' },
      { ...META, title: 'tab\there' },
      { ...META, title: 'new\nline' },
      { ...META, title: 'bell\u0007' },
      { ...META, title: 'c1\u0085' },
      { ...META, title: 'del\u007f' },
      { ...META, title: 'é' }, // not NFC (NFC is é)
      { ...META, title: 'a‮b' },
      { ...META, title: 'a⁦b' },
      { ...META, title: 'lone \ud800' },
      { ...META, title: 5 },
      { ...META, description: 'x'.repeat(501) },
      { ...META, description: 'tab\tin description' },
      { ...META, description: 'cr\r\n' },
      { ...META, character: 'x'.repeat(41) },
      { ...META, character: 'Ole\u0000v' },
      { ...META, listed: true },
      { ...META, listed: undefined },
      { ...META, extra: 1 },
      { ...META, lengthS: -1 },
      { ...META, lengthS: '93' },
      { ...META, lengthS: 31 * 86_400 + 1 },
      { ...META, level: 1.5 },
      { ...META, level: -1 },
      { ...META, level: null },
      [],
      'not json {',
    ];
    for (const m of bad) {
      const res = await post(cookie, m);
      expect(res.status, JSON.stringify(m)).toBe(400);
    }
    // A meta length of 0, past the body, past the bound, and bytes that are not UTF-8.
    const data = payload(50);
    for (const b of [
      (() => {
        const x = pubBody(META, data);
        new DataView(x.buffer).setUint32(0, 0);
        return x;
      })(),
      (() => {
        const x = pubBody(META, data);
        new DataView(x.buffer).setUint32(0, x.length);
        return x;
      })(),
      (() => {
        const x = pubBody(META, data);
        new DataView(x.buffer).setUint32(0, 9000);
        return x;
      })(),
      pubBody(null, data, Uint8Array.of(0x7b, 0xff, 0x7d)),
    ]) {
      const res = await call('POST', '/api/u/pub', undefined, { cookie, headers: { 'content-type': 'application/octet-stream', 'content-length': String(b.length) }, body: b });
      expect(res.status).toBe(400);
    }
    expect(await count('publication')).toBe(0);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0 });
    // What is allowed: 100 characters of any script (by code point), a description with newlines, an empty one, no character.
    await ok(await post(cookie, { ...META, title: '🗡'.repeat(100), description: '' }));
    await ok(await post(cookie, { ...META, title: 'Åsa och Ørjan', description: 'a\nb\n\nc', character: '' }));
  });

  it('413 pub_quota at sharedRuns, with the limit', async () => {
    const cookie = await signUp('alice');
    await setLimits('alice', { sharedRuns: 2 });
    await publish(cookie);
    await publish(cookie);
    const res = await post(cookie);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'pub_quota', limit: 2 });
    expect(await accountRow('alice')).toMatchObject({ pub_count: 2, pub_bytes: 200 });
    expect(await count('publication')).toBe(2);
    expect((await r2Keys()).length).toBe(2);
  });

  it('parallel posts at 150 never pass it', async () => {
    const cookie = await signUp('alice');
    // 148 already (the count is what is checked).
    await db.prepare("UPDATE account SET pub_count = 148 WHERE name_key = 'alice'").run();
    const answers = await Promise.all(Array.from({ length: 8 }, (_, i) => post(cookie, META, payload(60 + i, i))));
    const statuses = answers.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 413, 413, 413, 413, 413, 413]);
    expect((await accountRow('alice')).pub_count).toBe(150);
    expect(await count('publication')).toBe(2);
    expect((await r2Keys()).length).toBe(2);
  });

  it('an id taken is drawn again', async () => {
    const cookie = await signUp('alice');
    const real = crypto.getRandomValues.bind(crypto);
    let first = true;
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
      if (first && a instanceof Uint8Array && a.length === 16) {
        first = false;
        a.fill(0);
        return a;
      }
      return real(a as never) as T;
    });
    await db.prepare(`INSERT INTO publication (id, account, state, created, updated) VALUES ('AAAAAAAAAAAA', 'someone', 'active', 1, 1)`).run();
    const id = await publish(cookie);
    expect(first).toBe(false);
    expect(id).not.toBe('AAAAAAAAAAAA');
    expect(id).toMatch(PUB_ID_PATTERN);
    expect((await pubRow('AAAAAAAAAAAA'))?.account).toBe('someone');
    expect((await accountRow('alice')).pub_count).toBe(1);
  });

  it('ids are 12 characters of [A-Za-z0-9], all of them used', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const id = newPubId();
      expect(id).toMatch(PUB_ID_PATTERN);
      for (const ch of id) seen.add(ch);
    }
    expect(seen.size).toBe(62);
  });

  it('R2 down: 503, the count given back, no row', async () => {
    const cookie = await signUp('alice');
    const res = await post(cookie, META, payload(100), { env: envOf({ FILES: faultyBucket({ fail: ['put'] }) }) });
    expect(res.status).toBe(503);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
    expect(await count('publication')).toBe(0);
    // Without the binding: 503 before anything.
    expect((await post(cookie, META, payload(100), { env: envOf({ FILES: undefined }) })).status).toBe(503);
    expect(await count('publication')).toBe(0);
  });

  it('a stored size that is not the declared one: 503, the object goes, the count given back', async () => {
    const cookie = await signUp('alice');
    const res = await post(cookie, META, payload(100), { env: envOf({ FILES: faultyBucket({ putSize: 99 }) }) });
    expect(res.status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
    // A tombstone, its bytes 0 now that R2 confirmed the delete.
    const rows = (await db.prepare('SELECT state, bytes FROM publication').all()).results;
    expect(rows).toEqual([{ state: 'removed', bytes: 0 }]);
  });

  it('R2 took the object but the stream failed: not trusted (503), the object goes', async () => {
    const cookie = await signUp('alice');
    const early: R2 = {
      ...faultyBucket(),
      async put(k, value, options) {
        const head = await bucket.put(k, payload(100), options);
        if (typeof (value as ReadableStream).cancel === 'function') await (value as ReadableStream).cancel(new Error('the connection was cut')).catch(() => {});
        return head;
      },
    };
    const res = await post(cookie, META, payload(100), { env: envOf({ FILES: early }) });
    expect(res.status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
  });

  it('a payload shorter than the Content-Length says never gets stored', async () => {
    const cookie = await signUp('alice');
    const full = pubBody(META, payload(100));
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(full.slice(0, full.length - 40));
        ctl.close();
      },
    });
    const res = await post(cookie, META, payload(100), { body: stream });
    expect(res.status).toBe(503);
    expect(await r2Keys()).toEqual([]);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
  });

  it('the account deleted while the payload was uploaded: 401, the object goes', async () => {
    const cookie = await signUp('alice');
    const racing: R2 = {
      ...faultyBucket(),
      async put(k, value, options) {
        const head = await bucket.put(k, value, options);
        expect((await call('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie })).status).toBe(204);
        return head;
      },
    };
    const res = await post(cookie, META, payload(100), { env: envOf({ FILES: racing }) });
    expect(res.status).toBe(401);
    expect(await r2Keys()).toEqual([]);
    expect((await db.prepare('SELECT state FROM publication').all()).results).toEqual([{ state: 'removed' }]);
  });
});

describe('GET, PATCH and DELETE /api/u/pub', () => {
  it('lists the account’s own runs, newest first, with views and state', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const a1 = await publish(alice, payload(100), { ...META, title: 'first' }, { now: NOW });
    const a2 = await publish(alice, payload(200), { ...META, title: 'second' }, { now: NOW + 1000 });
    await publish(bob);
    await db.prepare("UPDATE publication SET state = 'hidden', hidden_reason = 'reports' WHERE id = ?1").bind(a1).run();
    const { pubs } = await ok<{ pubs: MyPub[] }>(await call('GET', '/api/u/pub', undefined, { cookie: alice }));
    expect(pubs.map((p) => [p.id, p.title, p.state, p.bytes])).toEqual([
      [a2, 'second', 'active', 200],
      [a1, 'first', 'hidden', 100],
    ]);
    // A removed one is not listed.
    await call('DELETE', `/api/u/pub/${a2}`, undefined, { cookie: alice });
    expect((await ok<{ pubs: MyPub[] }>(await call('GET', '/api/u/pub', undefined, { cookie: alice }))).pubs.map((p) => p.id)).toEqual([a1]);
  });

  it('PATCH changes title and description; listed and unknown keys are refused; another’s run is 404', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await publish(alice);
    const res = await call('PATCH', `/api/u/pub/${id}`, { title: 'New title' }, { cookie: alice, now: NOW + 5000 });
    const { pub } = await ok<PubWritten>(res);
    expect(pub).toMatchObject({ id, title: 'New title', description: META.description, updated: NOW + 5000, created: NOW });
    expect((await ok<PubWritten>(await call('PATCH', `/api/u/pub/${id}`, { description: '' }, { cookie: alice }))).pub.description).toBe('');
    for (const b of [{}, { listed: true }, { listed: false }, { title: '' }, { title: 'a\u0000' }, { description: 'x'.repeat(501) }, { title: 'ok', other: 1 }]) {
      expect((await call('PATCH', `/api/u/pub/${id}`, b, { cookie: alice })).status, JSON.stringify(b)).toBe(400);
    }
    expect((await call('PATCH', `/api/u/pub/${id}`, { title: 'mine now' }, { cookie: bob })).status).toBe(404);
    expect((await call('PATCH', '/api/u/pub/nope', { title: 'x' }, { cookie: alice })).status).toBe(404);
    expect((await pubRow(id))?.title).toBe('New title');
  });

  it('DELETE leaves a tombstone without text: the link says 410, the object and the count go; again is 204; another’s is 404', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await publish(alice, payload(300));
    expect((await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie: bob })).status).toBe(404);
    const res = await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie: alice, now: NOW + 1 });
    expect(res.status).toBe(204);
    expect(await r2Keys()).toEqual([]);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
    expect(await pubRow(id)).toMatchObject({ state: 'removed', title: '', description: '', character: '', level: null, bytes: 0, updated: NOW + 1 });
    for (const r of [await meta(id), await payloadOf(id), await view(id, device())]) {
      expect(r.status).toBe(410);
      expect(await r.json()).toEqual({ error: 'gone' });
    }
    expect((await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie: alice })).status).toBe(204);
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0 });
  });

  it('DELETE with R2 down still removes the run; the cron deletes the object later', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const res = await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie: alice, env: envOf({ FILES: faultyBucket({ fail: ['delete'] }) }) });
    expect(res.status).toBe(204);
    expect((await meta(id)).status).toBe(410);
    expect(await pubRow(id)).toMatchObject({ state: 'removed', bytes: 100 });
    expect(await r2Keys()).toEqual([`pub/${id}`]);
    await runCron(ENV, DAILY_CRON, NOW + DAY);
    expect(await r2Keys()).toEqual([]);
    expect(await pubRow(id)).toMatchObject({ bytes: 0 });
  });
});

describe('the public link', () => {
  it('GET /api/pub/<id>: the meta with the sender’s name, no session needed', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice, payload(500));
    const res = await meta(id);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(await res.json()).toEqual({
      id,
      title: META.title,
      description: META.description,
      sender: 'alice',
      character: 'Olev',
      level: 26,
      lengthS: 93.5,
      created: NOW,
      views: 0,
      bytes: 500,
    } satisfies PubMeta);
  });

  it('GET /api/pub/<id>/payload: the stored bytes with the ADR’s headers and no CORS', async () => {
    const alice = await signUp('alice');
    const data = payload(777, 3);
    const id = await publish(alice, data);
    const res = await payloadOf(id);
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      'content-type': 'application/octet-stream',
      'content-length': '777',
      'cache-control': 'private, max-age=604800, immutable',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'attachment',
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(data);
    // HEAD: no body.
    const head = await call('HEAD', `/api/pub/${id}/payload`);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('the states: unknown and pending 404, removed 410, hidden 451; a wrong method 405', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    for (const path of ['/api/pub/AAAAAAAAAAAA', '/api/pub/short', '/api/pub/AAAAAAAAAAAA/payload', `/api/pub/${id}/more`, '/api/pub/']) {
      const res = await call('GET', path);
      expect(res.status, path).toBe(404);
    }
    await db.prepare(`INSERT INTO publication (id, account, state, created, updated) VALUES ('BBBBBBBBBBBB', 'x', 'pending', 1, 1)`).run();
    expect((await meta('BBBBBBBBBBBB')).status).toBe(404);
    await db.prepare("UPDATE publication SET state = 'hidden', hidden_reason = 'admin' WHERE id = ?1").bind(id).run();
    for (const r of [await meta(id), await payloadOf(id), await view(id, device())]) {
      expect(r.status).toBe(451);
      expect(await r.json()).toEqual({ error: 'hidden' });
    }
    expect((await call('POST', `/api/pub/${id}`, {})).status).toBe(405);
    expect((await call('GET', `/api/pub/${id}/view`)).status).toBe(405);
  });

  it('the sender sees a hidden run with hidden: true, and its payload; another account does not', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const data = payload(150);
    const id = await publish(alice, data);
    await db.prepare("UPDATE publication SET state = 'hidden', hidden_reason = 'reports' WHERE id = ?1").bind(id).run();
    const own = await ok<PubMeta>(await call('GET', `/api/u/pub/${id}`, undefined, { cookie: alice }));
    expect(own).toMatchObject({ id, sender: 'alice', hidden: true });
    const bytes = await call('GET', `/api/u/pub/${id}/payload`, undefined, { cookie: alice });
    expect(bytes.status).toBe(200);
    expect(bytes.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(data);
    expect((await call('GET', `/api/u/pub/${id}`, undefined, { cookie: bob })).status).toBe(404);
    expect((await call('GET', `/api/u/pub/${id}/payload`, undefined, { cookie: bob })).status).toBe(404);
    // An active one has no `hidden`.
    await db.prepare("UPDATE publication SET state = 'active', hidden_reason = NULL WHERE id = ?1").bind(id).run();
    expect('hidden' in (await ok<PubMeta>(await call('GET', `/api/u/pub/${id}`, undefined, { cookie: alice })))).toBe(false);
  });

  it('a view counts once per device and UTC day', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const a = device();
    const b = device();
    for (const [dev, now] of [
      [a, NOW],
      [a, NOW + 1000],
      [b, NOW],
      [a, NOW + DAY],
      [a, NOW + DAY + 1],
    ] as const) {
      const res = await view(id, dev, now);
      expect(res.status).toBe(204);
    }
    expect((await ok<PubMeta>(await meta(id))).views).toBe(3);
    expect((await ok<{ pubs: MyPub[] }>(await call('GET', '/api/u/pub', undefined, { cookie: alice }))).pubs[0]?.views).toBe(3);
    for (const bad of [{}, { device: 'not-a-uuid' }, { device: a, more: 1 }, { device: 'ABCDEF00-0000-4000-8000-000000000001' }]) {
      expect((await call('POST', `/api/pub/${id}/view`, bad)).status).toBe(400);
    }
    expect((await view('AAAAAAAAAAAA', a)).status).toBe(404);
  });

  it('a view is limited per address by BEAT_LIMITER, the public paths by API_LIMITER', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const deny = { limit: async () => ({ success: false }) };
    expect((await call('POST', `/api/pub/${id}/view`, { device: device() }, { env: envOf({ BEAT_LIMITER: deny }) })).status).toBe(429);
    expect((await call('GET', `/api/pub/${id}`, undefined, { env: envOf({ API_LIMITER: deny }) })).status).toBe(429);
    expect((await ok<PubMeta>(await meta(id))).views).toBe(0);
  });

  it('without a database: 503', async () => {
    expect((await call('GET', '/api/pub/AAAAAAAAAAAA', undefined, { env: envOf({ DB: undefined }) })).status).toBe(503);
  });
});

describe('the daily cron', () => {
  it('prunes views older than two days', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    await view(id, device(), NOW - 3 * DAY);
    await view(id, device(), NOW - 2 * DAY);
    await view(id, device(), NOW - DAY);
    await view(id, device(), NOW);
    await runCron(ENV, DAILY_CRON, NOW);
    expect((await db.prepare('SELECT day FROM pub_view ORDER BY day').all()).results.map((r) => r.day)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
    // The count stays.
    expect((await pubRow(id))?.views).toBe(4);
  });

  it('gives the count of a pending row left behind back after an hour, and deletes its object', async () => {
    await signUp('alice');
    const { id: account } = await accountRow('alice');
    await db.batch([
      db.prepare(`INSERT INTO publication (id, account, title, bytes, state, created, updated) VALUES ('PPPPPPPPPPPP', ?1, 't', 40, 'pending', ?2, ?2)`).bind(account, NOW),
      db.prepare('UPDATE account SET pub_count = 1, pub_bytes = 40 WHERE id = ?1').bind(account),
    ]);
    await bucket.put('pub/PPPPPPPPPPPP', payload(40));
    await runCron(ENV, DAILY_CRON, NOW + PENDING_STALE_MS - 1);
    expect((await pubRow('PPPPPPPPPPPP'))?.state).toBe('pending');
    await runCron(ENV, DAILY_CRON, NOW + PENDING_STALE_MS);
    expect(await pubRow('PPPPPPPPPPPP')).toMatchObject({ state: 'removed', title: '', bytes: 0 });
    expect(await accountRow('alice')).toMatchObject({ pub_count: 0, pub_bytes: 0 });
    expect(await r2Keys()).toEqual([]);
  });
});

describe('Delete account', () => {
  it('removes its published runs: tombstones (410), the objects, the reports handled; others’ runs stay', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const a1 = await publish(alice);
    const a2 = await publish(alice);
    const b1 = await publish(bob);
    expect((await reportOf(bob, a1)).status).toBe(204);
    expect((await call('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie: alice })).status).toBe(204);
    for (const id of [a1, a2]) {
      expect((await meta(id)).status).toBe(410);
      expect(await pubRow(id)).toMatchObject({ state: 'removed', title: '', bytes: 0 });
    }
    expect(await r2Keys()).toEqual([`pub/${b1}`]);
    expect((await meta(b1)).status).toBe(200);
    expect((await db.prepare('SELECT handled FROM report').first<{ handled: number }>())?.handled).toBe(NOW);
  });

  it('R2 failing on the payloads: the links still say removed, the cron deletes the objects', async () => {
    const alice = await signUp('alice');
    const id = await publish(alice);
    const res = await call('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie: alice, env: envOf({ FILES: faultyBucket({ fail: ['delete', 'list'] }) }) });
    expect(res.status).toBe(204);
    expect((await meta(id)).status).toBe(410);
    expect(await r2Keys()).toEqual([`pub/${id}`]);
    await runCron(ENV, DAILY_CRON, NOW + DAY);
    expect(await r2Keys()).toEqual([]);
  });
});

describe('/r/* (the watch page)', () => {
  it('/r/<id> answers the site’s index.html with the root’s _headers rules, whatever the id and the flag', async () => {
    for (const path of ['/r/AbCdEfGh1234', '/r/not-an-id', '/r/']) {
      for (const env of [ENV, envWith({})]) {
        const res = await call('GET', path, undefined, { env });
        expect(res.status, path).toBe(200);
        expect(await res.text(), path).toContain('<p>index</p>');
        expect(res.headers.get('content-type'), path).toMatch(/^text\/html/);
        expect(res.headers.get('x-test-rule'), path).toBe('root');
      }
    }
    // The root's ETag answers a revalidation.
    const etag = (await call('GET', '/r/AbCdEfGh1234')).headers.get('etag') as string;
    expect((await call('GET', '/r/AbCdEfGh1234', undefined, { headers: { 'if-none-match': etag } })).status).toBe(304);
  });

  it('a file under /r/ is the assets’ own answer (the frame document), with its own rule', async () => {
    // Workers assets match a `_headers` rule by the clean path (`/r/frame`),
    // also when the file is asked for as `/r/frame.html` (seen in Miniflare).
    for (const path of ['/r/frame', '/r/frame.html']) {
      const res = await call('GET', path);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toContain('<p>frame</p>');
      expect(res.headers.get('x-test-rule'), path).toBe('frame');
    }
  });
});
