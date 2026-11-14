// Stage 60 part B (spec §7.2): the account API client
// (src/cloud/account/api.ts) against a mocked fetch: what it sends, how
// every documented error code comes back, what it refuses of an answer,
// and that it never rejects.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_ERRORS, DEFAULT_ACCOUNT_LIMITS, OTHER_SESSIONS } from '../../shared/cloud/api';
import { type AccountApi, type AccountFetch, createAccountApi, failureOf, parseAccount, parseParams } from '../../src/cloud/account/api';
import { parseConfig } from '../../src/cloud/config';

const B = (bytes: number): string => 'A'.repeat(Math.ceil((bytes * 4) / 3));
const KEY = B(32);
const SALT = B(16);
const WRAP = B(61);
const KDF = { name: 'pbkdf2-sha256', rounds: 600_000 } as const;
const SET = { salt: SALT, kdf: KDF, authKey: KEY, wrapPw: WRAP };

const account = () => ({
  name: 'Olev',
  created: 1_700_000_000_000,
  state: 'active',
  usage: { items: 0, itemBytes: 0, runBytes: 0 },
  limits: { ...DEFAULT_ACCOUNT_LIMITS },
  sessions: [{ id: 'abcdefghijklmnop', label: 'Firefox on Linux', created: 1, lastUsed: 2, current: true }],
  prefs: { galleryNotice: true },
});

interface Call {
  url: string;
  init: RequestInit;
}

function client(status: number, body?: unknown, o: { enabled?: boolean } = {}): { api: AccountApi; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: AccountFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      status,
      json: async () => {
        if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
        return body;
      },
    };
  };
  return { api: createAccountApi({ fetch, enabled: async () => o.enabled !== false }), calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('what is sent', () => {
  it('every endpoint: method, path, credentials, X-WC on what changes state, the body as JSON', async () => {
    const { api, calls } = client(204);
    await api.params('Olev');
    await api.register({ name: 'Olev', ...SET, recoveryAuth: KEY, wrapRc: WRAP, label: 'l', turnstile: 't' });
    await api.login({ name: 'Olev', authKey: KEY, label: 'l' });
    await api.recover({ name: 'Olev', recoveryAuth: KEY, turnstile: 't' });
    await api.recoverSet({ name: 'Olev', recoveryAuth: KEY, ticket: 'x', set: SET, label: 'l' });
    await api.logout();
    await api.account();
    await api.password({ authKey: KEY, set: SET });
    await api.recovery({ authKey: KEY, recoveryAuth: KEY, wrapRc: WRAP });
    await api.endSession('abcdefghijklmnop');
    await api.endSession(OTHER_SESSIONS);
    await api.setPrefs({ galleryNotice: false });
    await api.remove({ authKey: KEY });
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET /api/auth/params?name=Olev',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/recover',
      'POST /api/auth/recover',
      'POST /api/u/auth/logout',
      'GET /api/u/account',
      'POST /api/u/account/password',
      'POST /api/u/account/recovery',
      'DELETE /api/u/account/sessions/abcdefghijklmnop',
      'DELETE /api/u/account/sessions/others',
      'PATCH /api/u/account/prefs',
      'DELETE /api/u/account',
    ]);
    for (const c of calls) {
      const headers = c.init.headers as Record<string, string>;
      expect(c.init.credentials).toBe('same-origin');
      expect(c.init.cache).toBe('no-store');
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
      expect(headers['X-WC']).toBe(c.init.method === 'GET' ? undefined : '1');
      expect(headers['Content-Type']).toBe(c.init.body === undefined ? undefined : 'application/json');
    }
    expect(JSON.parse(calls[2]!.init.body as string)).toEqual({ name: 'Olev', authKey: KEY, label: 'l' });
    expect(JSON.parse(calls.at(-1)!.init.body as string)).toEqual({ authKey: KEY });
    expect(calls[5]!.init.body).toBeUndefined();
  });

  it('nothing when accounts are off for the page: disabled', async () => {
    const { api, calls } = client(200, {}, { enabled: false });
    expect(await api.params('Olev')).toEqual({ ok: false, code: 'disabled' });
    expect(await api.logout()).toEqual({ ok: false, code: 'disabled' });
    expect(await api.account()).toEqual({ ok: false, code: 'disabled' });
    expect(calls).toEqual([]);
    const throws = createAccountApi({ fetch: vi.fn(), enabled: () => Promise.reject(new Error('x')) });
    expect(await throws.account()).toEqual({ ok: false, code: 'disabled' });
  });

  it('refuses a name or a session id that cannot be one before anything is sent', async () => {
    const { api, calls } = client(200, {});
    expect(await api.params('a b')).toEqual({ ok: false, code: 'bad_request' });
    expect(await api.params('../u/account')).toEqual({ ok: false, code: 'bad_request' });
    expect(await api.endSession('../../account')).toEqual({ ok: false, code: 'bad_request' });
    expect(await api.endSession('')).toEqual({ ok: false, code: 'bad_request' });
    expect(calls).toEqual([]);
  });
});

describe('errors', () => {
  const STATUS: Record<string, number> = {
    bad_request: 400,
    forbidden: 403,
    unauthorized: 401,
    not_found: 404,
    method_not_allowed: 405,
    name_taken: 409,
    invalid_login: 401,
    invalid_recovery: 401,
    turnstile_required: 403,
    turnstile: 403,
    locked: 429,
    rate_limited: 429,
    unavailable: 503,
    accounts_not_configured: 503,
  };

  it('every code of the contract comes back as itself', async () => {
    expect(Object.keys(STATUS).sort()).toEqual([...ACCOUNT_ERRORS].sort());
    for (const code of ACCOUNT_ERRORS) {
      const status = STATUS[code]!;
      const { api } = client(status, code === 'locked' ? { error: code, retryAfter: 432 } : { error: code });
      const r = await api.login({ name: 'Olev', authKey: KEY, label: 'l' });
      expect(r).toEqual(code === 'locked' ? { ok: false, code, status, retryAfter: 432 } : { ok: false, code, status });
    }
  });

  it('locked without a usable time is the longest wait', () => {
    expect(failureOf(429, { error: 'locked' }).retryAfter).toBe(900);
    expect(failureOf(429, { error: 'locked', retryAfter: -5 }).retryAfter).toBe(900);
    expect(failureOf(429, { error: 'locked', retryAfter: '60' }).retryAfter).toBe(900);
    expect(failureOf(429, { error: 'locked', retryAfter: 1e9 }).retryAfter).toBe(900);
    expect(failureOf(429, { error: 'locked', retryAfter: 1 }).retryAfter).toBe(1);
  });

  it('an error without one of our codes is read by its status; a bare 401 is never unauthorized', () => {
    expect(failureOf(404, undefined)).toEqual({ ok: false, code: 'not_found', status: 404 });
    expect(failureOf(404, '<!doctype html>')).toEqual({ ok: false, code: 'not_found', status: 404 });
    expect(failureOf(429, { error: 'slow_down' })).toEqual({ ok: false, code: 'rate_limited', status: 429 });
    expect(failureOf(500, { error: 'internal' })).toEqual({ ok: false, code: 'unavailable', status: 500 });
    expect(failureOf(502, undefined)).toEqual({ ok: false, code: 'unavailable', status: 502 });
    expect(failureOf(401, undefined)).toEqual({ ok: false, code: 'bad_answer', status: 401 });
    expect(failureOf(401, { error: 'nope' })).toEqual({ ok: false, code: 'bad_answer', status: 401 });
    expect(failureOf(302, undefined)).toEqual({ ok: false, code: 'bad_answer', status: 302 });
    expect(failureOf(400, { error: ['bad_request'] })).toEqual({ ok: false, code: 'bad_answer', status: 400 });
  });

  it('offline: a fetch that rejects or throws', async () => {
    const rejects = createAccountApi({ fetch: () => Promise.reject(new TypeError('Failed to fetch')), enabled: async () => true });
    expect(await rejects.account()).toEqual({ ok: false, code: 'offline' });
    const throws = createAccountApi({
      fetch: () => {
        throw new Error('sync');
      },
      enabled: async () => true,
    });
    expect(await throws.logout()).toEqual({ ok: false, code: 'offline' });
  });

  it('timeout: no answer in time, even from a fetch that ignores its signal', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hang: AccountFetch = (_url, init) => {
      signal = init.signal ?? undefined;
      return new Promise(() => undefined);
    };
    const api = createAccountApi({ fetch: hang, enabled: async () => true, timeoutMs: 1000 });
    const p = api.account();
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toEqual({ ok: false, code: 'timeout' });
    expect(signal?.aborted).toBe(true);
  });

  it('cancelled: the caller\'s signal, before or during the request', async () => {
    const hang: AccountFetch = (_url, init) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const api = createAccountApi({ fetch: hang, enabled: async () => true });
    const abort = new AbortController();
    const p = api.params('Olev', { signal: abort.signal });
    await Promise.resolve();
    await Promise.resolve();
    abort.abort();
    expect(await p).toEqual({ ok: false, code: 'cancelled' });
    expect(await api.params('Olev', { signal: abort.signal })).toEqual({ ok: false, code: 'cancelled' });
  });
});

describe('answers are checked before they are used', () => {
  it('params: the salt and the KDF within the bounds', async () => {
    expect((await client(200, { salt: SALT, kdf: KDF, extra: 1 }).api.params('Olev'))).toEqual({ ok: true, value: { salt: SALT, kdf: KDF } });
    for (const bad of [
      null,
      'text',
      { salt: SALT },
      { salt: B(8), kdf: KDF },
      { salt: B(17), kdf: KDF },
      { salt: `${SALT.slice(0, -1)}+`, kdf: KDF },
      { salt: SALT, kdf: { name: 'md5', rounds: 600_000 } },
      { salt: SALT, kdf: { name: 'pbkdf2-sha256', rounds: 1000 } },
      { salt: SALT, kdf: { name: 'pbkdf2-sha256', rounds: 10_000_001 } },
      { salt: SALT, kdf: { name: 'pbkdf2-sha256', rounds: 600_000.5 } },
      { salt: SALT, kdf: { name: 'pbkdf2-sha256', rounds: '600000' } },
    ]) {
      expect(parseParams(bad), JSON.stringify(bad)).toBeUndefined();
      expect(await client(200, bad).api.params('Olev')).toEqual({ ok: false, code: 'bad_answer', status: 200 });
    }
  });

  it('the account: only the contract\'s fields are passed on; a label is cut to printable ASCII', () => {
    const a = account();
    expect(parseAccount({ ...a, secret: 'x', sessions: [{ ...a.sessions[0], extra: 1 }] })).toEqual(a);
    const odd = parseAccount({ ...a, sessions: [{ ...a.sessions[0], label: `  <img src=x>\u0000‮ ${'y'.repeat(80)}` }] })!;
    expect(odd.sessions[0]!.label).toBe(`<img src=x> ${'y'.repeat(28)}`);
    expect(odd.sessions[0]!.label.length).toBe(40);
    expect(parseAccount({ ...a, state: 'suspended' })!.state).toBe('suspended');
  });

  it('the account: anything else is refused', () => {
    const a = account();
    const bad: unknown[] = [
      null,
      [],
      { ...a, name: 'a b' },
      { ...a, name: 7 },
      { ...a, created: '2026' },
      { ...a, created: -1 },
      { ...a, state: 'banned' },
      { ...a, usage: { items: 0, itemBytes: 0 } },
      { ...a, usage: { items: 0, itemBytes: 0, runBytes: 1.5 } },
      { ...a, limits: { ...a.limits, sharedRuns: undefined } },
      { ...a, limits: null },
      { ...a, prefs: { galleryNotice: 'yes' } },
      { ...a, prefs: undefined },
      { ...a, sessions: {} },
      { ...a, sessions: [null] },
      { ...a, sessions: [{ ...a.sessions[0], id: 'a/b' }] },
      { ...a, sessions: [{ ...a.sessions[0], id: 'x'.repeat(65) }] },
      { ...a, sessions: [{ ...a.sessions[0], label: 5 }] },
      { ...a, sessions: [{ ...a.sessions[0], lastUsed: null }] },
      { ...a, sessions: [{ ...a.sessions[0], current: 1 }] },
    ];
    for (const v of bad) expect(parseAccount(v), JSON.stringify(v)).toBeUndefined();
  });

  it('login and account need a wrap; register and the second recover call need the account; the first a wrap and a ticket; prefs the prefs', async () => {
    const a = account();
    const login = { name: 'Olev', authKey: KEY, label: 'l' };
    expect(await client(200, { account: a, wrapPw: WRAP }).api.login(login)).toEqual({ ok: true, value: { account: a, wrapPw: WRAP } });
    expect(await client(200, { account: a, wrapPw: WRAP }).api.account()).toEqual({ ok: true, value: { account: a, wrapPw: WRAP } });
    for (const body of [{ account: a }, { account: a, wrapPw: B(10) }, { account: a, wrapPw: B(201) }, { account: a, wrapPw: 'not base64!' }, { wrapPw: WRAP }, undefined]) {
      expect(await client(200, body).api.login(login)).toEqual({ ok: false, code: 'bad_answer', status: 200 });
    }
    const reg = { name: 'Olev', ...SET, recoveryAuth: KEY, wrapRc: WRAP, label: 'l', turnstile: 't' };
    expect(await client(201, { account: a }).api.register(reg)).toEqual({ ok: true, value: { account: a } });
    expect(await client(201, { account: { ...a, name: '' } }).api.register(reg)).toEqual({ ok: false, code: 'bad_answer', status: 201 });
    const rec = { name: 'Olev', recoveryAuth: KEY, turnstile: 't' };
    expect(await client(200, { wrapRc: WRAP, ticket: 'abc_-9' }).api.recover(rec)).toEqual({ ok: true, value: { wrapRc: WRAP, ticket: 'abc_-9' } });
    for (const body of [{ wrapRc: WRAP }, { wrapRc: WRAP, ticket: '' }, { wrapRc: WRAP, ticket: 'x'.repeat(101) }, { wrapRc: WRAP, ticket: 'a b' }, { ticket: 'abc' }]) {
      expect(await client(200, body).api.recover(rec)).toEqual({ ok: false, code: 'bad_answer', status: 200 });
    }
    expect(await client(200, { prefs: { galleryNotice: false, x: 1 } }).api.setPrefs({ galleryNotice: false })).toEqual({ ok: true, value: { prefs: { galleryNotice: false } } });
    expect(await client(200, { prefs: {} }).api.setPrefs({ galleryNotice: false })).toEqual({ ok: false, code: 'bad_answer', status: 200 });
  });

  it('204 is an answer without a body', async () => {
    expect(await client(204).api.logout()).toEqual({ ok: true, value: null });
    expect(await client(204).api.remove({ authKey: KEY })).toEqual({ ok: true, value: null });
    expect(await client(204).api.endSession(OTHER_SESSIONS)).toEqual({ ok: true, value: null });
  });
});

describe('/api/config beside the flags', () => {
  it('keeps the site key, the limits and the time when they hold', () => {
    const limits = { ...DEFAULT_ACCOUNT_LIMITS };
    expect(parseConfig({ flags: { accounts: true }, turnstileSiteKey: '0x4AAAAAAA-b_c', limits, time: 1_700_000_000_000 })).toEqual({
      flags: { accounts: true },
      turnstileSiteKey: '0x4AAAAAAA-b_c',
      limits,
      time: 1_700_000_000_000,
    });
    expect(parseConfig({ flags: {}, limits: { ...limits, more: 1 } }).limits).toEqual(limits);
  });

  it('leaves out what does not hold, and still has the flags', () => {
    const limits = { ...DEFAULT_ACCOUNT_LIMITS };
    for (const extra of [
      { turnstileSiteKey: '' },
      { turnstileSiteKey: 7 },
      { turnstileSiteKey: '"><script>' },
      { turnstileSiteKey: 'x'.repeat(101) },
      { limits: { ...limits, items: -1 } },
      { limits: { ...limits, runBytes: '1' } },
      { limits: { items: 1 } },
      { limits: 'many' },
      { time: 'now' },
      { time: Number.NaN },
      { time: -1 },
    ]) {
      expect(parseConfig({ flags: { stats: true }, ...extra }), JSON.stringify(extra)).toEqual({ flags: { stats: true } });
    }
  });
});
