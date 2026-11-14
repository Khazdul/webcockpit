// Stage 60 part B (spec §7.2): the account's client core in a real
// browser, for cloud-account.spec.ts (desktop) and
// phone-cloud-account.spec.ts. Not a spec (no tests).
//
// No page uses src/cloud/account yet, so the page imports it from the dev
// server's module URL (as cloud-crypto.ts does) and drives a whole life of
// an account against the fake of the account API (cloud-account-fake.ts):
// register → log out → log in → change password → recover → delete. What
// only a browser can show: the real KDF worker inside the flows, real
// IndexedDB keeping non-extractable keys across a reload, the `storage`
// event between two tabs, and the requests as a browser sends them
// (`Origin`, `X-WC`).
import { type Page, expect } from '@playwright/test';
import { type FakeAccountApi, FAKE_SITE_KEY, fakeAccountApi } from './cloud-account-fake';

const MODULE = '/src/cloud/account/index.ts';
const CRYPTO_MODULE = '/src/cloud/crypto/index.ts';
const NAME = 'Olev';
const PASSWORD_1 = 'correct horse battery';
const PASSWORD_2 = 'a second password 2';
const PASSWORD_3 = 'the recovered password 3';

/** What the device holds: the databases, the stored record, the hint. */
async function deviceOf(page: Page): Promise<{ databases: string[]; hint: string | null; last: string | null; keys: { extractable: boolean; type: string; algorithm: string }[] }> {
  return page.evaluate(async () => {
    const databases = (await indexedDB.databases()).map((d) => `${d.name}@${d.version}`).sort();
    const keys: { extractable: boolean; type: string; algorithm: string }[] = [];
    if (databases.some((d) => d.startsWith('webcockpit-account@'))) {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('webcockpit-account');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const rec = await new Promise<Record<string, unknown> | undefined>((res, rej) => {
        const r = db.transaction('account').objectStore('account').get('self');
        r.onsuccess = () => res(r.result as Record<string, unknown> | undefined);
        r.onerror = () => rej(r.error);
      });
      db.close();
      for (const k of [rec?.dataKey, rec?.idKey]) {
        if (k instanceof CryptoKey) keys.push({ extractable: k.extractable, type: k.type, algorithm: k.algorithm.name });
      }
    }
    return { databases, hint: localStorage.getItem('wc.account'), last: localStorage.getItem('wc.account.last'), keys };
  });
}

/** Loads the module in the page and leaves a small driver on `window.__acct` for the steps below. */
async function loadModule(page: Page): Promise<void> {
  await page.evaluate(async ([path, cryptoPath]) => {
    const m = await import(/* @vite-ignore */ path!);
    const c = await import(/* @vite-ignore */ cryptoPath!);
    const steps: string[] = [];
    const run = { onStep: (s: string, i: { inline?: boolean }) => steps.push(i.inline ? `${s}(inline)` : s) };
    (window as unknown as { __acct: unknown }).__acct = { m, c, steps, run };
  }, [MODULE, CRYPTO_MODULE]);
}

interface Driver {
  m: typeof import('../../src/cloud/account/index');
  c: typeof import('../../src/cloud/crypto/index');
  steps: string[];
  run: { onStep: (s: string, i: { inline?: boolean }) => void };
}

declare global {
  interface Window {
    __acct?: Driver;
  }
}

export interface AccountRun {
  /** The register flow's derivation with the worker's start, as the flow measured it (ms). */
  kdfMs: number;
}

/** The whole life of an account through the module, in this page. */
export async function accountLife(page: Page): Promise<AccountRun> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { server, browser }: FakeAccountApi = await fakeAccountApi(page);
  await page.goto('/?cloudtest');
  await page.waitForLoadState('load');
  const before = await deviceOf(page);
  expect(before.databases.filter((d) => d.startsWith('webcockpit-account'))).toEqual([]);
  await loadModule(page);

  // The start page's state: the flag on, nobody logged in; the site key reaches the pages.
  const start = await page.evaluate(async () => {
    const { m } = window.__acct!;
    const state = await m.watchAccountState();
    return { state, config: await m.accountConfig() };
  });
  expect(start.state).toEqual({ enabled: true, name: null, lastName: null });
  expect(start.config.turnstileSiteKey).toBe(FAKE_SITE_KEY);
  expect(start.config.limits?.items).toBe(2000);

  // A second tab of the same browser: it must follow what the first one does.
  const tab = await page.context().newPage();
  await fakeAccountApi(tab, { server });
  await tab.goto('/?cloudtest');
  await tab.waitForLoadState('load');
  await tab.evaluate(async (path) => {
    const m = await import(/* @vite-ignore */ path);
    await m.watchAccountState();
    const seen: (string | null)[] = [];
    m.onAccountState((s: { name: string | null }) => seen.push(s.name));
    (window as unknown as { __seen: unknown }).__seen = { seen, state: () => m.accountState() };
  }, MODULE);
  // The changes of name the other tab was told of, from nobody (a login arrives as two calls: the prefill, then the name).
  const tabSeen = async (): Promise<(string | null)[]> => {
    const seen = await tab.evaluate(() => (window as unknown as { __seen: { seen: (string | null)[] } }).__seen.seen);
    return seen.filter((name, i) => name !== (i === 0 ? null : seen[i - 1]));
  };

  // --- Register (the real KDF worker inside the flow) ---
  const reg = await page.evaluate(
    async ({ name, password }) => {
      const { m, c, steps, run } = window.__acct!;
      const aliveBefore = c.kdfWorkerAlive();
      const flow = m.startRegister(name, password);
      const noToken = await flow.submit(run);
      const r = await flow.submit({ ...run, turnstile: 'token-register' });
      return {
        noToken,
        r,
        aliveBefore,
        aliveAfter: c.kdfWorkerAlive(),
        steps: steps.splice(0),
        state: m.accountState(),
        kdfMs: Number(localStorage.getItem('wc.kdfMs')),
        estimate: m.estimateKdfMs(),
        label: m.deviceLabel(navigator.userAgent),
        lastGroupOk: r.ok ? m.lastGroupMatches(r.value.recoveryCode, r.value.recoveryCode.slice(-4).toLowerCase()) : false,
      };
    },
    { name: NAME, password: PASSWORD_1 },
  );
  expect(reg.noToken).toEqual({ ok: false, code: 'turnstile_required' });
  expect(reg.r.ok).toBe(true);
  if (!reg.r.ok) throw new Error('register failed');
  const code1 = reg.r.value.recoveryCode;
  expect(code1).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
  expect(reg.r.value.stored).toBe(true);
  expect(reg.r.value.account.name).toBe(NAME);
  expect(reg.lastGroupOk).toBe(true);
  expect(reg.aliveBefore).toBe(false);
  expect(reg.aliveAfter).toBe(true); // the flow's KDF ran in the worker
  expect(reg.steps).toEqual(['deriving', 'sending', 'saving']);
  expect(reg.state).toEqual({ enabled: true, name: NAME, lastName: NAME });
  expect(reg.kdfMs).toBeGreaterThan(0);
  expect(reg.estimate).toBe(reg.kdfMs);
  // The session's label is this browser's.
  expect(reg.r.value.account.sessions).toHaveLength(1);
  expect(reg.label).toMatch(/^(Firefox|Chrome) on (Linux|Android|Windows|macOS)$/);
  expect(reg.r.value.account.sessions[0]!.label).toBe(reg.label);
  expect(reg.r.value.account.sessions[0]!.current).toBe(true);
  // As a browser sends it: the CSRF rule held (the fake refuses otherwise), and the cookie is the browser's business.
  const sent = server.requests('POST /api/auth/register')[0]!;
  expect(sent.status).toBe(201);
  expect(sent.headers['x-wc']).toBe('1');
  expect(sent.headers.origin).toBe(new URL(page.url()).origin);
  expect(browser.cookie).not.toBeNull();

  // On the device: a database of its own with two non-extractable keys; the main database untouched.
  const held = await deviceOf(page);
  expect(held.databases).toEqual([...before.databases, 'webcockpit-account@1'].sort());
  expect(held.keys).toEqual([
    { extractable: false, type: 'secret', algorithm: 'AES-GCM' },
    { extractable: false, type: 'secret', algorithm: 'HMAC' },
  ]);
  expect(held.hint).toBe(`{"name":"${NAME}"}`);
  await expect.poll(tabSeen).toEqual([NAME]);

  // --- A reload: still logged in, the keys still work, the account loads ---
  await page.reload();
  await page.waitForLoadState('load');
  await loadModule(page);
  const again = await page.evaluate(async () => {
    const { m, c } = window.__acct!;
    const state = await m.watchAccountState();
    const keys = await m.accountKeys();
    const blob = await c.seal(keys!.dataKey, 'profile', 'p1', new TextEncoder().encode('kept'));
    const text = new TextDecoder().decode(await c.open(keys!.dataKey, 'profile', 'p1', blob));
    let exported = true;
    try {
      await crypto.subtle.exportKey('raw', keys!.dataKey);
    } catch {
      exported = false;
    }
    return { state, text, exported, id: await c.opaqueId(keys!.idKey, 'profile', 'p1'), account: await m.loadAccount(), stored: (await m.storedAccount())?.name };
  });
  expect(again.state).toEqual({ enabled: true, name: NAME, lastName: NAME });
  expect(again.text).toBe('kept');
  expect(again.exported).toBe(false);
  expect(again.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(again.account.ok && again.account.value.name).toBe(NAME);
  expect(again.stored).toBe(NAME);

  // --- Log out ---
  const out = await page.evaluate(async () => {
    const { m } = window.__acct!;
    return { r: await m.logout(), state: m.accountState(), keys: await m.accountKeys() };
  });
  expect(out.r).toEqual({ ok: true, value: { server: 'ended', keysRemoved: true } });
  expect(out.state).toEqual({ enabled: true, name: null, lastName: NAME });
  expect(out.keys).toBeNull();
  expect((await deviceOf(page)).databases).toEqual(before.databases);
  expect(server.sessionLabels(NAME)).toEqual([]);
  expect(browser.cookie).toBeNull();
  await expect.poll(tabSeen).toEqual([NAME, null]);

  // --- Log in: three wrong passwords, then Turnstile is asked for and the retry does not derive again ---
  const login = await page.evaluate(
    async ({ name, password }) => {
      const { m, steps, run } = window.__acct!;
      const wrong: unknown[] = [];
      for (let i = 0; i < 3; i++) wrong.push(await m.startLogin(name, `a wrong password ${i}`).submit());
      const flow = m.startLogin(name.toLowerCase(), password);
      const first = await flow.submit(run);
      const firstSteps = steps.splice(0);
      const needs = flow.needsTurnstile;
      const second = await flow.submit({ ...run, turnstile: 'token-login' });
      return { wrong, first, firstSteps, needs, second, secondSteps: steps.splice(0), state: m.accountState() };
    },
    { name: NAME, password: PASSWORD_1 },
  );
  expect(login.wrong).toEqual([1, 2, 3].map(() => ({ ok: false, code: 'invalid_login' })));
  expect(login.first).toEqual({ ok: false, code: 'turnstile_required' });
  expect(login.firstSteps).toEqual(['checking', 'deriving', 'sending']);
  expect(login.needs).toBe(true);
  expect(login.second.ok).toBe(true);
  expect(login.secondSteps).toEqual(['sending', 'saving']);
  expect(login.state.name).toBe(NAME);
  expect(server.requests('GET /api/auth/params')).toHaveLength(4);
  await expect.poll(tabSeen).toEqual([NAME, null, NAME]);

  // --- Change password; a new recovery code ---
  const changed = await page.evaluate(
    async ({ old, next }) => {
      const { m, steps, run } = window.__acct!;
      const wrong = await m.changePassword('not the password', next);
      const r = await m.changePassword(old, next, run);
      const changeSteps = steps.splice(0);
      const code = await m.newRecoveryCode(next);
      return { wrong, r, changeSteps, code, state: m.accountState().name };
    },
    { old: PASSWORD_1, next: PASSWORD_2 },
  );
  expect(changed.wrong).toEqual({ ok: false, code: 'invalid_login' });
  expect(changed.r).toEqual({ ok: true, value: null });
  expect(changed.changeSteps).toEqual(['checking', 'deriving', 'sending']);
  expect(changed.code.ok).toBe(true);
  if (!changed.code.ok) throw new Error('no new code');
  const code2 = changed.code.value.recoveryCode;
  expect(code2).not.toBe(code1);
  expect(changed.state).toBe(NAME);

  // --- Recover, from the other tab (another "device" would have its own jar; here it replaces this browser's session) ---
  const rec = await page.evaluate(
    async ({ name, oldCode, code, password }) => {
      const { m, steps, run } = window.__acct!;
      const old = await m.startRecover(name, oldCode, password).submit({ turnstile: 'token-recover-old' });
      const flow = m.startRecover(name, code.toLowerCase().replace(/-/g, ' '), password);
      const r = await flow.submit({ ...run, turnstile: 'token-recover' });
      return { old, r, steps: steps.splice(0), keys: (await m.accountKeys()) !== null };
    },
    { name: NAME, oldCode: code1, code: code2, password: PASSWORD_3 },
  );
  expect(rec.old).toEqual({ ok: false, code: 'invalid_recovery' });
  expect(rec.r.ok).toBe(true);
  expect(rec.steps).toEqual(['checking', 'deriving', 'sending', 'saving']);
  expect(rec.keys).toBe(true);
  expect(server.requests('POST /api/auth/recover').filter((r) => r.status === 200)).toHaveLength(2);
  expect(server.sessionLabels(NAME)).toHaveLength(1);

  // --- Delete: the password of the recovery, and the device is left with nothing of the account ---
  const del = await page.evaluate(
    async ({ old, password }) => {
      const { m } = window.__acct!;
      const wrong = await m.deleteAccount(old);
      const r = await m.deleteAccount(password);
      return { wrong, r, state: m.accountState(), after: await m.loadAccount() };
    },
    { old: PASSWORD_2, password: PASSWORD_3 },
  );
  expect(del.wrong).toEqual({ ok: false, code: 'invalid_login' });
  expect(del.r).toEqual({ ok: true, value: null });
  expect(del.state).toEqual({ enabled: true, name: null, lastName: null });
  expect(del.after).toEqual({ ok: false, code: 'not_logged_in' });
  expect(server.hasAccount(NAME)).toBe(false);
  const end = await deviceOf(page);
  expect(end.databases).toEqual(before.databases);
  expect(end.hint).toBeNull();
  expect(end.last).toBeNull();
  await expect.poll(tabSeen).toEqual([NAME, null, NAME, null]);

  // The server never saw a password or a recovery code, in any spelling.
  for (const secret of [PASSWORD_1, PASSWORD_2, PASSWORD_3, code1, code2, code1.replace(/-/g, ''), code2.replace(/-/g, '')]) {
    expect(server.saw(secret)).toBe(false);
  }
  // Every account request was answered as the contract says it would be (nothing was refused as malformed or forbidden).
  expect(server.seen.filter((r) => [400, 403, 404, 405].includes(r.status) && !(r.status === 403 && r.path === '/api/auth/login'))).toEqual([]);
  await tab.close();
  expect(errors).toEqual([]);
  return { kdfMs: reg.kdfMs };
}

/** With the flag off, and without the test hook, the module sends nothing. */
export async function accountsOff(page: Page): Promise<void> {
  const { server } = await fakeAccountApi(page);
  server.flags = {};
  await page.goto('/?cloudtest');
  await page.waitForLoadState('load');
  await loadModule(page);
  const off = await page.evaluate(async () => {
    const { m } = window.__acct!;
    return {
      state: await m.watchAccountState(),
      login: await m.startLogin('Olev', 'correct horse battery').submit(),
      register: await m.startRegister('Olev', 'correct horse battery').submit({ turnstile: 't' }),
      logout: await m.logout(),
      databases: (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('webcockpit-account')),
    };
  });
  expect(off.state.enabled).toBe(false);
  expect(off.login).toEqual({ ok: false, code: 'disabled' });
  expect(off.register).toEqual({ ok: false, code: 'disabled' });
  expect(off.logout).toEqual({ ok: true, value: { server: 'unreached', keysRemoved: true } });
  expect(off.databases).toEqual([]);
  expect(server.seen).toEqual([]);

  // An automated browser without the hook: not even the flags are asked for.
  const requests: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(r.url());
  });
  await page.goto('/');
  await page.waitForLoadState('load');
  await loadModule(page);
  const plain = await page.evaluate(async () => {
    const { m } = window.__acct!;
    return { state: await m.watchAccountState(), login: await m.startLogin('Olev', 'correct horse battery').submit() };
  });
  expect(plain.state.enabled).toBe(false);
  expect(plain.login).toEqual({ ok: false, code: 'disabled' });
  expect(requests).toEqual([]);
}
