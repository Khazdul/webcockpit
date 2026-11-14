// Stage 60 part B (spec §7.2, ADR 0145): the account's flows
// (src/cloud/account/flows.ts) against the in-memory account server of the
// e2e specs (tests/e2e/cloud-account-fake.ts) behind a mocked fetch, with
// fake-indexeddb as the device's store. The real crypto runs, with a KDF
// of few rounds standing in for the worker's (counted, so "no second
// derivation" can be seen). The real KDF worker: tests/e2e/cloud-account.ts.
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../shared/cloud/api';
import { type AccountFetch, createAccountApi } from '../../src/cloud/account/api';
import { type AccountFlows, type FlowStep, type StepInfo, createAccountFlows } from '../../src/cloud/account/flows';
import { ACCOUNT_HINT_KEY, ACCOUNT_LAST_KEY, accountState, onAccountState, resetAccountStateForTest } from '../../src/cloud/account/state';
import { type AccountStore, createAccountStore } from '../../src/cloud/account/store';
import { CloudCryptoError, type PasswordKdf, open, opaqueId, seal } from '../../src/cloud/crypto';
import { derivePasswordKeysUnchecked } from '../../src/cloud/crypto/kdf';
import { type FakeBrowser, FakeAccountServer, type FakeRequest } from '../e2e/cloud-account-fake';

const ORIGIN = 'https://wc.test';
const PASSWORD = 'correct horse battery';
const utf8 = (s: string) => new TextEncoder().encode(s);

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

/** A fetch that is the fake server as one browser sees it (the browser adds `Origin` to what is not a GET). */
function fetchOf(browser: FakeBrowser): AccountFetch {
  return async (url, init) => {
    const u = new URL(url, ORIGIN);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const method = init.method ?? 'GET';
    if (method !== 'GET') headers.origin = ORIGIN;
    const req: FakeRequest = { method, path: u.pathname, search: u.search, headers, body: (init.body as string | undefined) ?? null, origin: ORIGIN };
    const res = browser.request(req);
    if (res === 'offline') throw new TypeError('Failed to fetch');
    return {
      status: res.status,
      json: async () => {
        if (res.body === undefined) throw new SyntaxError('no body');
        return structuredClone(res.body);
      },
    };
  };
}

interface Device {
  flows: AccountFlows;
  browser: FakeBrowser;
  store: AccountStore;
  factory: IDBFactory;
  /** Password derivations run on this device. */
  kdfRuns: () => number;
  kdf: { fail: 'worker' | 'always' | null; inline: number };
}

let server: FakeAccountServer;
let storage: MemoryStorage;

/** A device: a browser on the server, an IndexedDB of its own, the flows over both. (All devices of a test share one localStorage.) */
function device(o: { enabled?: boolean; works?: boolean } = {}): Device {
  const browser = server.browser();
  const factory = new IDBFactory();
  const base = createAccountStore(factory);
  const store: AccountStore = o.works === false ? { ...base, works: async () => false } : base;
  let runs = 0;
  const kdf: Device['kdf'] = { fail: null, inline: 0 };
  const derive: PasswordKdf = async (name, password, salt, _kdf, opts) => {
    if (opts?.signal?.aborted) throw new CloudCryptoError('cancelled');
    if (kdf.fail === 'always' || (kdf.fail === 'worker' && !opts?.inline)) throw new CloudCryptoError('worker_failed');
    if (opts?.inline) kdf.inline++;
    runs++;
    return derivePasswordKeysUnchecked(name, password, salt, 1000);
  };
  const enabled = async () => o.enabled !== false;
  const flows = createAccountFlows({
    api: createAccountApi({ fetch: fetchOf(browser), enabled }),
    store,
    crypto: () => import('../../src/cloud/crypto'),
    derive,
    enabled,
    label: () => 'Firefox on Linux',
    now: () => server.now(),
  });
  return { flows, browser, store, factory, kdfRuns: () => runs, kdf };
}

async function registered(d: Device, name = 'Olev', password = PASSWORD): Promise<{ account: Account; recoveryCode: string }> {
  const r = await d.flows.startRegister(name, password).submit({ turnstile: `t-${Math.random()}` });
  if (!r.ok) throw new Error(`register failed: ${r.code}`);
  return r.value;
}

beforeEach(() => {
  server = new FakeAccountServer();
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  resetAccountStateForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('register', () => {
  it('makes the account, stores two non-extractable keys, returns the recovery code once, and tells the start page', async () => {
    const d = device();
    const changes: (string | null)[] = [];
    onAccountState((s) => changes.push(s.name));
    const steps: [FlowStep, StepInfo][] = [];
    const flow = d.flows.startRegister('Olev', PASSWORD);
    expect(flow.needsTurnstile).toBe(true);
    const r = await flow.submit({ turnstile: 'tok-1', onStep: (s, i) => steps.push([s, i]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.account.name).toBe('Olev');
    expect(r.value.stored).toBe(true);
    expect(r.value.recoveryCode).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(r.value.account.sessions).toEqual([expect.objectContaining({ label: 'Firefox on Linux', current: true })]);
    expect(steps.map((s) => s[0])).toEqual(['deriving', 'sending', 'saving']);
    expect(steps[0]![1].estimateMs).toBeGreaterThan(0);
    expect(flow.finished).toBe(true);
    expect(await flow.submit({ turnstile: 'tok-2' })).toEqual({ ok: false, code: 'finished' });

    // The device: the record and the keys, and the hint.
    const me = await d.flows.storedAccount();
    expect(me).toMatchObject({ name: 'Olev', label: 'Firefox on Linux', created: r.value.account.created });
    expect(me!.dataKey.extractable).toBe(false);
    expect(me!.idKey.extractable).toBe(false);
    expect(accountState()).toMatchObject({ name: 'Olev', lastName: 'Olev' });
    expect(changes).toEqual(['Olev']);
    // The keys work: an item sealed with them opens, and ids come out.
    const keys = (await d.flows.accountKeys())!;
    const blob = await seal(keys.dataKey, 'profile', 'p1', utf8('hello'));
    expect(new TextDecoder().decode(await open(keys.dataKey, 'profile', 'p1', blob))).toBe('hello');
    expect(await opaqueId(keys.idKey, 'profile', 'p1')).toMatch(/^[A-Za-z0-9_-]{22}$/);

    // The server saw neither the password nor the code, and exactly the contract's fields.
    expect(server.saw(PASSWORD)).toBe(false);
    expect(server.saw(r.value.recoveryCode)).toBe(false);
    expect(server.saw(r.value.recoveryCode.replace(/-/g, ''))).toBe(false);
    const sent = server.requests('POST /api/auth/register')[0]!;
    expect(Object.keys(sent.body as object).sort()).toEqual(['authKey', 'kdf', 'label', 'name', 'recoveryAuth', 'salt', 'turnstile', 'wrapPw', 'wrapRc']);
    expect(sent.headers['x-wc']).toBe('1');
    // Nothing secret in localStorage.
    expect(storage.getItem(ACCOUNT_HINT_KEY)).toBe('{"name":"Olev"}');
  });

  it('needs a Turnstile token; a refused one is retried with a new one without deriving again', async () => {
    const d = device();
    const flow = d.flows.startRegister('Olev', PASSWORD);
    expect(await flow.submit()).toEqual({ ok: false, code: 'turnstile_required' });
    expect(d.kdfRuns()).toBe(0);
    expect(await flow.submit({ turnstile: 'bad-1' })).toEqual({ ok: false, code: 'turnstile' });
    expect(d.kdfRuns()).toBe(1);
    const r = await flow.submit({ turnstile: 'good-1' });
    expect(r.ok).toBe(true);
    expect(d.kdfRuns()).toBe(1);
  });

  it('name_taken ends the flow; a reserved name is taken too', async () => {
    await registered(device());
    const d = device();
    const flow = d.flows.startRegister('OLEV', PASSWORD);
    expect(await flow.submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'name_taken' });
    expect(flow.finished).toBe(true);
    expect(await d.flows.startRegister('admin', PASSWORD).submit({ turnstile: 'b' })).toEqual({ ok: false, code: 'name_taken' });
    expect(await d.flows.storedAccount()).toBeNull();
  });

  it('an answer that was lost: the retry finds the name taken by itself and logs in with its own key', async () => {
    const d = device();
    const flow = d.flows.startRegister('Olev', PASSWORD);
    server.dropNextAnswer = true;
    expect(await flow.submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'offline' });
    expect(server.hasAccount('Olev')).toBe(true);
    expect(await d.flows.storedAccount()).toBeNull();
    const r = await flow.submit({ turnstile: 'b' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stored).toBe(true);
    expect(d.kdfRuns()).toBe(1);
    // The code returned is the one the server holds: it recovers the account.
    const other = device();
    const rec = await other.flows.startRecover('Olev', r.value.recoveryCode, 'another password 1').submit({ turnstile: 'c' });
    expect(rec.ok).toBe(true);
  });

  it('checks before it derives: a bad name, a short password, a device that cannot keep keys, accounts off', async () => {
    const d = device();
    expect(await d.flows.startRegister('ab', PASSWORD).submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'bad_input' });
    expect(await d.flows.startRegister('Olev', 'short').submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'bad_input' });
    expect(await device({ works: false }).flows.startRegister('Olev', PASSWORD).submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'storage_failed' });
    expect(await device({ enabled: false }).flows.startRegister('Olev', PASSWORD).submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'disabled' });
    expect(d.kdfRuns()).toBe(0);
    expect(server.seen).toEqual([]);
  });

  it('the account is made but the device cannot store it: the code is still returned, nobody is logged in', async () => {
    const d = device();
    d.store.write = async () => {
      throw new Error('quota');
    };
    const r = await d.flows.startRegister('Olev', PASSWORD).submit({ turnstile: 'a' });
    expect(r.ok && r.value.stored).toBe(false);
    expect(r.ok && r.value.recoveryCode).toMatch(/-/);
    expect(accountState().name).toBeNull();
    expect(server.sessionLabels('Olev')).toEqual([]);
  });

  it('rate_limited after the address limit, unavailable, offline: the same flow can be submitted again', async () => {
    const d = device();
    const flow = d.flows.startRegister('Olev', PASSWORD);
    server.registrationsLeft = 0;
    expect(await flow.submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'rate_limited' });
    server.registrationsLeft = 1;
    server.fail = 'unavailable';
    expect(await flow.submit({ turnstile: 'b' })).toEqual({ ok: false, code: 'unavailable' });
    server.fail = 'offline';
    expect(await flow.submit({ turnstile: 'c' })).toEqual({ ok: false, code: 'offline' });
    server.fail = null;
    expect((await flow.submit({ turnstile: 'd' })).ok).toBe(true);
    expect(d.kdfRuns()).toBe(1);
  });
});

describe('log in', () => {
  it('logs in on another device with the same keys', async () => {
    const a = device();
    await registered(a);
    const keysA = (await a.flows.accountKeys())!;
    const b = device();
    const steps: FlowStep[] = [];
    const r = await b.flows.startLogin('olev', PASSWORD).submit({ onStep: (s) => steps.push(s) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(steps).toEqual(['checking', 'deriving', 'sending', 'saving']);
    // The name as the server spells it, whatever was typed.
    expect(r.value.name).toBe('Olev');
    expect((await b.flows.storedAccount())!.name).toBe('Olev');
    expect(r.value.sessions).toHaveLength(2);
    const keysB = (await b.flows.accountKeys())!;
    const blob = await seal(keysA.dataKey, 'k', 'i', utf8('x'));
    expect(await open(keysB.dataKey, 'k', 'i', blob)).toEqual(utf8('x'));
    expect(await opaqueId(keysB.idKey, 'k', 'i')).toBe(await opaqueId(keysA.idKey, 'k', 'i'));
    expect(server.saw(PASSWORD)).toBe(false);
  });

  it('a wrong password and an unknown name are the same answer, and end the flow', async () => {
    await registered(device());
    const d = device();
    const wrong = d.flows.startLogin('Olev', 'not the password');
    expect(await wrong.submit()).toEqual({ ok: false, code: 'invalid_login' });
    expect(wrong.finished).toBe(true);
    expect(await d.flows.startLogin('nobody', PASSWORD).submit()).toEqual({ ok: false, code: 'invalid_login' });
    expect(await d.flows.storedAccount()).toBeNull();
    expect(accountState().name).toBeNull();
  });

  it('turnstile_required after three failures: the retry with a token does not derive again', async () => {
    await registered(device());
    const d = device();
    for (let i = 0; i < 3; i++) expect((await d.flows.startLogin('Olev', `wrong password ${i}`).submit()).ok).toBe(false);
    const before = d.kdfRuns();
    const flow = d.flows.startLogin('Olev', PASSWORD);
    expect(flow.needsTurnstile).toBe(false);
    expect(await flow.submit()).toEqual({ ok: false, code: 'turnstile_required' });
    expect(flow.needsTurnstile).toBe(true);
    expect(flow.finished).toBe(false);
    // A refused token: a new one, still no new derivation.
    expect(await flow.submit({ turnstile: 'bad-token' })).toEqual({ ok: false, code: 'turnstile' });
    const r = await flow.submit({ turnstile: 'good-token' });
    expect(r.ok).toBe(true);
    expect(d.kdfRuns()).toBe(before + 1);
    expect(server.requests('GET /api/auth/params')).toHaveLength(4);
    const logins = server.requests('POST /api/auth/login');
    expect((logins.at(-1)!.body as { turnstile?: string }).turnstile).toBe('good-token');
    expect((logins.at(-3)!.body as { turnstile?: string }).turnstile).toBeUndefined();
  });

  it('locked after ten failures, with the seconds; the same flow gets in when the lock has run out', async () => {
    await registered(device());
    const d = device();
    for (let i = 0; i < 10; i++) await d.flows.startLogin('Olev', `wrong password ${i}`).submit({ turnstile: `t${i}` });
    const flow = d.flows.startLogin('Olev', PASSWORD);
    const locked = await flow.submit({ turnstile: 'x' });
    expect(locked).toEqual({ ok: false, code: 'locked', retryAfter: 900 });
    expect(flow.finished).toBe(false);
    server.advance(901_000);
    const runs = d.kdfRuns();
    expect((await flow.submit()).ok).toBe(true);
    expect(d.kdfRuns()).toBe(runs);
  });

  it('corrupt_wrap: the server accepts the password but its wrap does not open; a distinct error, no session left, nothing stored', async () => {
    await registered(device());
    server.corruptWrap('Olev');
    const d = device();
    const flow = d.flows.startLogin('Olev', PASSWORD);
    expect(await flow.submit()).toEqual({ ok: false, code: 'corrupt_wrap' });
    expect(flow.finished).toBe(true);
    expect(await d.flows.storedAccount()).toBeNull();
    expect(accountState().name).toBeNull();
    // The session the server made for it was ended again.
    expect(server.sessionLabels('Olev')).toHaveLength(1);
    expect(d.browser.cookie).toBeNull();
  });

  it('the KDF worker fails: the derivation runs once on the page\'s thread and the page is told', async () => {
    await registered(device());
    const d = device();
    d.kdf.fail = 'worker';
    const steps: [FlowStep, StepInfo][] = [];
    const r = await d.flows.startLogin('Olev', PASSWORD).submit({ onStep: (s, i) => steps.push([s, i]) });
    expect(r.ok).toBe(true);
    expect(d.kdf.inline).toBe(1);
    expect(steps.filter((s) => s[0] === 'deriving').map((s) => s[1].inline ?? false)).toEqual([false, true]);
    // Both ways fail: worker_failed, and the flow can be tried again.
    const e = device();
    e.kdf.fail = 'always';
    const flow = e.flows.startLogin('Olev', PASSWORD);
    expect(await flow.submit()).toEqual({ ok: false, code: 'worker_failed' });
    e.kdf.fail = null;
    expect((await flow.submit()).ok).toBe(true);
  });

  it('cancel during the derivation: cancelled, nothing sent to log in, and the flow can run again', async () => {
    await registered(device());
    const d = device();
    const abort = new AbortController();
    const flow = d.flows.startLogin('Olev', PASSWORD);
    const r = await flow.submit({ signal: abort.signal, onStep: (s) => s === 'deriving' && abort.abort() });
    expect(r).toEqual({ ok: false, code: 'cancelled' });
    expect(server.requests('POST /api/auth/login')).toHaveLength(0);
    expect((await flow.submit()).ok).toBe(true);
  });

  it('one submit at a time; dispose ends it; offline and a garbage answer are told apart', async () => {
    await registered(device());
    const d = device();
    const flow = d.flows.startLogin('Olev', PASSWORD);
    const first = flow.submit();
    expect(await flow.submit()).toEqual({ ok: false, code: 'busy' });
    expect((await first).ok).toBe(true);
    const gone = d.flows.startLogin('Olev', PASSWORD);
    gone.dispose();
    expect(await gone.submit()).toEqual({ ok: false, code: 'finished' });
    server.fail = 'offline';
    expect(await d.flows.startLogin('Olev', PASSWORD).submit()).toEqual({ ok: false, code: 'offline' });
    server.fail = 'garbage';
    expect(await d.flows.startLogin('Olev', PASSWORD).submit()).toEqual({ ok: false, code: 'bad_answer' });
    server.fail = 'accounts_not_configured';
    expect(await d.flows.startLogin('Olev', PASSWORD).submit()).toEqual({ ok: false, code: 'accounts_not_configured' });
    server.fail = null;
    server.flags = {};
    expect(await d.flows.startLogin('Olev', PASSWORD).submit()).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('log out', () => {
  it('ends the session on the server and removes the keys; the name stays for the prefill', async () => {
    const d = device();
    await registered(d);
    const r = await d.flows.logout();
    expect(r).toEqual({ ok: true, value: { server: 'ended', keysRemoved: true } });
    expect(server.sessionLabels('Olev')).toEqual([]);
    expect(await d.store.read()).toBeNull();
    expect(await d.flows.accountKeys()).toBeNull();
    expect(accountState()).toMatchObject({ name: null, lastName: 'Olev' });
    expect((await d.factory.databases()).map((x) => x.name)).toEqual([]);
  });

  it('with the server down the device is logged out all the same, and says so', async () => {
    const d = device();
    await registered(d);
    server.fail = 'offline';
    expect(await d.flows.logout()).toEqual({ ok: true, value: { server: 'unreached', keysRemoved: true } });
    expect(await d.store.read()).toBeNull();
    expect(accountState().name).toBeNull();
    server.fail = null;
    // The session is still valid on the server (the page says so).
    expect(server.sessionLabels('Olev')).toHaveLength(1);
    // A session the server no longer knows counts as ended.
    const e = device();
    await e.flows.startLogin('Olev', PASSWORD).submit();
    server.endSessions('Olev');
    expect(await e.flows.logout()).toEqual({ ok: true, value: { server: 'ended', keysRemoved: true } });
  });
});

describe('logged in', () => {
  it('loadAccount gives the account; a session ended elsewhere is 401: logged out locally, the name remembered', async () => {
    const d = device();
    await registered(d);
    server.addSession('Olev', '<b>Chrome</b> on Android');
    const r = await d.flows.loadAccount();
    expect(r.ok && r.value.sessions.map((s) => s.label).sort()).toEqual(['<b>Chrome</b> on Android', 'Firefox on Linux']);
    expect(r.ok && r.value.usage).toEqual({ items: 0, itemBytes: 0, runBytes: 0 });

    server.endSessions('Olev');
    const changes: (string | null)[] = [];
    onAccountState((s) => changes.push(s.name));
    expect(await d.flows.loadAccount()).toEqual({ ok: false, code: 'unauthorized' });
    expect(await d.store.read()).toBeNull();
    expect(accountState()).toMatchObject({ name: null, lastName: 'Olev' });
    expect(changes).toEqual([null]);
    expect(await d.flows.loadAccount()).toEqual({ ok: false, code: 'not_logged_in' });
  });

  it('a failure that is not 401 leaves the device logged in', async () => {
    const d = device();
    await registered(d);
    for (const fail of ['unavailable', 'offline', 'rate_limited', 'garbage'] as const) {
      server.fail = fail;
      expect((await d.flows.loadAccount()).ok).toBe(false);
      expect(accountState().name).toBe('Olev');
      expect(await d.store.read()).not.toBeNull();
    }
  });

  it('a hint without stored keys ends as logged out', async () => {
    const d = device();
    await registered(d);
    await d.store.remove();
    expect(accountState().name).toBe('Olev');
    expect(await d.flows.loadAccount()).toEqual({ ok: false, code: 'not_logged_in' });
    expect(accountState().name).toBeNull();
  });

  it('change password: the old one stops working, the new one logs in to the same keys, other sessions end', async () => {
    const a = device();
    await registered(a);
    const b = device();
    await b.flows.startLogin('Olev', PASSWORD).submit();
    const keys = (await a.flows.accountKeys())!;
    const steps: [FlowStep, StepInfo][] = [];
    const runs = a.kdfRuns();
    expect(await a.flows.changePassword(PASSWORD, 'a brand new password', { onStep: (s, i) => steps.push([s, i]) })).toEqual({ ok: true, value: null });
    expect(steps.map((s) => s[0])).toEqual(['checking', 'deriving', 'sending']);
    expect(a.kdfRuns()).toBe(runs + 2);
    expect(server.saw('a brand new password')).toBe(false);
    // This session stays, the other is gone.
    expect((await a.flows.loadAccount()).ok).toBe(true);
    expect(await b.flows.loadAccount()).toEqual({ ok: false, code: 'unauthorized' });
    const c = device();
    expect(await c.flows.startLogin('Olev', PASSWORD).submit()).toEqual({ ok: false, code: 'invalid_login' });
    expect((await c.flows.startLogin('Olev', 'a brand new password').submit()).ok).toBe(true);
    const blob = await seal(keys.dataKey, 'k', 'i', utf8('same root'));
    expect(await open((await c.flows.accountKeys())!.dataKey, 'k', 'i', blob)).toEqual(utf8('same root'));
  });

  it('change password with a wrong old password is invalid_login and changes nothing; a short new one is bad_input', async () => {
    const d = device();
    await registered(d);
    const before = server.stored('Olev');
    expect(await d.flows.changePassword('not my password', 'a brand new password')).toEqual({ ok: false, code: 'invalid_login' });
    expect(await d.flows.changePassword(PASSWORD, 'short')).toEqual({ ok: false, code: 'bad_input' });
    expect(server.stored('Olev')).toEqual(before);
    expect(server.requests('POST /api/u/account/password')).toHaveLength(0);
    expect(accountState().name).toBe('Olev');
  });

  it('new recovery code: returned once, the old one stops working, the new one recovers', async () => {
    const d = device();
    const { recoveryCode: old } = await registered(d);
    const r = await d.flows.newRecoveryCode(PASSWORD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.recoveryCode).not.toBe(old);
    expect(server.saw(r.value.recoveryCode)).toBe(false);
    expect(await d.flows.newRecoveryCode('wrong password!')).toEqual({ ok: false, code: 'invalid_login' });
    const other = device();
    expect(await other.flows.startRecover('Olev', old, 'yet another password').submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'invalid_recovery' });
    expect((await other.flows.startRecover('Olev', r.value.recoveryCode, 'yet another password').submit({ turnstile: 'b' })).ok).toBe(true);
  });

  it('ends one session and all others; an id already gone counts as ended', async () => {
    const d = device();
    await registered(d);
    const one = server.addSession('Olev', 'Chrome on Android');
    server.addSession('Olev', 'Safari on iOS');
    server.addSession('Olev', 'Edge on Windows');
    expect(await d.flows.endSession(one)).toEqual({ ok: true, value: null });
    expect(server.sessionLabels('Olev').sort()).toEqual(['Edge on Windows', 'Firefox on Linux', 'Safari on iOS']);
    expect(await d.flows.endSession(one)).toEqual({ ok: true, value: null });
    expect(await d.flows.endSession('not an id')).toEqual({ ok: false, code: 'bad_request' });
    expect(await d.flows.endOtherSessions()).toEqual({ ok: true, value: null });
    expect(server.sessionLabels('Olev')).toEqual(['Firefox on Linux']);
    expect(accountState().name).toBe('Olev');
  });

  it('set prefs', async () => {
    const d = device();
    await registered(d);
    expect(await d.flows.setPrefs({ galleryNotice: false })).toEqual({ ok: true, value: { galleryNotice: false } });
    expect(server.stored('Olev')!.prefs).toEqual({ galleryNotice: false });
  });

  it('delete account: the password again; the account is gone, the name reserved, the device logged out and the name forgotten', async () => {
    const d = device();
    await registered(d);
    expect(await d.flows.deleteAccount('not my password')).toEqual({ ok: false, code: 'invalid_login' });
    expect(server.hasAccount('Olev')).toBe(true);
    expect(accountState().name).toBe('Olev');
    expect(await d.flows.deleteAccount(PASSWORD)).toEqual({ ok: true, value: null });
    expect(server.hasAccount('Olev')).toBe(false);
    expect(await d.store.read()).toBeNull();
    expect(accountState()).toMatchObject({ name: null, lastName: null });
    expect(storage.getItem(ACCOUNT_LAST_KEY)).toBeNull();
    expect(await device().flows.startRegister('olev', PASSWORD).submit({ turnstile: 'again' })).toEqual({ ok: false, code: 'name_taken' });
  });

  it('the password questions honour the lock: locked with the seconds', async () => {
    const d = device();
    await registered(d);
    for (let i = 0; i < 10; i++) await d.flows.deleteAccount(`wrong password ${i}`);
    expect(await d.flows.deleteAccount(PASSWORD)).toEqual({ ok: false, code: 'locked', retryAfter: 900 });
    expect(server.hasAccount('Olev')).toBe(true);
  });

  it('every logged-in flow answers not_logged_in on a device without an account, and sends nothing', async () => {
    const d = device();
    const f = d.flows;
    const all = [f.loadAccount(), f.changePassword(PASSWORD, 'a brand new password'), f.newRecoveryCode(PASSWORD), f.endSession('abc'), f.endOtherSessions(), f.deleteAccount(PASSWORD), f.setPrefs({ galleryNotice: true })];
    for (const r of await Promise.all(all)) expect(r).toEqual({ ok: false, code: 'not_logged_in' });
    expect(server.seen).toEqual([]);
    expect(await f.accountKeys()).toBeNull();
    // No database was left behind by looking.
    expect(await d.factory.databases()).toEqual([]);
  });
});

describe('recover', () => {
  it('two calls with the ticket; a new password, the same keys, every older session ended, the code still valid', async () => {
    const a = device();
    const { recoveryCode } = await registered(a);
    const keys = (await a.flows.accountKeys())!;
    const b = device();
    const flow = b.flows.startRecover('olev', recoveryCode.toLowerCase().replace(/-/g, ' '), 'the recovered password');
    expect(flow.needsTurnstile).toBe(true);
    expect(await flow.submit()).toEqual({ ok: false, code: 'turnstile_required' });
    const steps: FlowStep[] = [];
    const r = await flow.submit({ turnstile: 'tok', onStep: (s) => steps.push(s) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(steps).toEqual(['checking', 'deriving', 'sending', 'saving']);
    expect(r.value.name).toBe('Olev');
    expect(r.value.sessions).toHaveLength(1);

    const calls = server.requests('POST /api/auth/recover');
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]!.body as object).sort()).toEqual(['name', 'recoveryAuth', 'turnstile']);
    expect(Object.keys(calls[1]!.body as object).sort()).toEqual(['label', 'name', 'recoveryAuth', 'set', 'ticket']);
    expect(server.saw('the recovered password')).toBe(false);
    expect(server.saw(recoveryCode)).toBe(false);

    const blob = await seal(keys.dataKey, 'k', 'i', utf8('kept'));
    expect(await open((await b.flows.accountKeys())!.dataKey, 'k', 'i', blob)).toEqual(utf8('kept'));
    // (The devices of a test share one localStorage, so this also clears the hint.)
    expect(await a.flows.loadAccount()).toEqual({ ok: false, code: 'unauthorized' });
    const c = device();
    expect(await c.flows.startLogin('Olev', PASSWORD).submit()).toEqual({ ok: false, code: 'invalid_login' });
    expect((await c.flows.startLogin('Olev', 'the recovered password').submit()).ok).toBe(true);
    expect((await device().flows.startRecover('Olev', recoveryCode, 'once more a password').submit({ turnstile: 'tok2' })).ok).toBe(true);
  });

  it('a wrong code or an unknown name is invalid_recovery and ends the flow; not a code is bad_input', async () => {
    await registered(device());
    const d = device();
    const wrong = d.flows.startRecover('Olev', '0000-0000-0000-0000-0000-0000', 'the recovered password');
    expect(await wrong.submit({ turnstile: 'a' })).toEqual({ ok: false, code: 'invalid_recovery' });
    expect(wrong.finished).toBe(true);
    expect(await d.flows.startRecover('nobody', '0000-0000-0000-0000-0000-0000', 'the recovered password').submit({ turnstile: 'b' })).toEqual({ ok: false, code: 'invalid_recovery' });
    expect(await d.flows.startRecover('Olev', 'not a code', 'the recovered password').submit({ turnstile: 'c' })).toEqual({ ok: false, code: 'bad_input' });
    expect(await d.flows.startRecover('Olev', '0000-0000-0000-0000-0000-0000', 'short').submit({ turnstile: 'd' })).toEqual({ ok: false, code: 'bad_input' });
    expect(d.kdfRuns()).toBe(0);
  });

  it('the second call fails: the same flow sends it again without a token and without deriving again', async () => {
    const a = device();
    const { recoveryCode } = await registered(a);
    const d = device();
    const flow = d.flows.startRecover('Olev', recoveryCode, 'the recovered password');
    server.failWhen = (req) => req.body !== null && req.body !== undefined && req.body.includes('"ticket"');
    server.fail = 'unavailable';
    expect(await flow.submit({ turnstile: 'tok' })).toEqual({ ok: false, code: 'unavailable' });
    expect(flow.needsTurnstile).toBe(false);
    expect(d.kdfRuns()).toBe(1);
    server.fail = null;
    expect((await flow.submit()).ok).toBe(true);
    expect(d.kdfRuns()).toBe(1);
    expect(server.requests('POST /api/auth/recover')).toHaveLength(3);
    expect(accountState().name).toBe('Olev');
  });

  it('a ticket that ran out is invalid_recovery; a refused token is retried; locked carries the seconds', async () => {
    const { recoveryCode } = await registered(device());
    const d = device();
    const flow = d.flows.startRecover('Olev', recoveryCode, 'the recovered password');
    server.failWhen = (req) => typeof req.body === 'string' && req.body.includes('"ticket"');
    server.fail = 'offline';
    expect(await flow.submit({ turnstile: 'tok' })).toEqual({ ok: false, code: 'offline' });
    server.fail = null;
    server.advance(901_000);
    expect(await flow.submit()).toEqual({ ok: false, code: 'invalid_recovery' });
    expect(flow.finished).toBe(true);

    const again = d.flows.startRecover('Olev', recoveryCode, 'the recovered password');
    expect(await again.submit({ turnstile: 'bad' })).toEqual({ ok: false, code: 'turnstile' });
    expect(again.finished).toBe(false);
    for (let i = 0; i < 10; i++) await d.flows.startRecover('Olev', '0000-0000-0000-0000-0000-0000', 'the recovered password').submit({ turnstile: `w${i}` });
    expect(await again.submit({ turnstile: 'good' })).toEqual({ ok: false, code: 'locked', retryAfter: 900 });
  });
});

describe('the start page\'s state', () => {
  it('follows the flows: nobody, logged in, logged out', async () => {
    const d = device();
    const seen: (string | null)[] = [];
    const off = onAccountState((s) => seen.push(s.name));
    expect(accountState()).toEqual({ enabled: null, name: null, lastName: null });
    await registered(d);
    await d.flows.logout();
    await d.flows.startLogin('Olev', PASSWORD).submit();
    off();
    await d.flows.logout();
    expect(seen).toEqual(['Olev', null, 'Olev']);
  });
});
