// Stage 60 part B (ADR 0145 "As built (stage 60 part B)"): where the
// account lives on the device (src/cloud/account/store.ts, a database of
// its own, with fake-indexeddb), the start page's state (state.ts), the
// checks (checks.ts), the device label and the remembered KDF time.
import { IDBFactory } from 'fake-indexeddb';
import { NAME_PATTERN } from '../../shared/cloud/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  checkName,
  checkPassword,
  checkRecoveryCode,
  passwordLength,
  passwordStrength,
  passwordsMatch,
} from '../../src/cloud/account/checks';
import { KDF_GUESS_MS, KDF_TIME_KEY, estimateKdfMs, noteKdfMs } from '../../src/cloud/account/kdf-time';
import {
  ACCOUNT_HINT_KEY,
  ACCOUNT_LAST_KEY,
  HINT_NAME_PATTERN,
  accountState,
  accountsEnabled,
  noteLoggedIn,
  noteLoggedOut,
  onAccountState,
  resetAccountStateForTest,
  watchAccountState,
} from '../../src/cloud/account/state';
import { ACCOUNT_DB_NAME, type StoredAccount, createAccountStore, isStoredAccount } from '../../src/cloud/account/store';
import { resetConfigForTest } from '../../src/cloud/config';
import { cleanLabel, deviceLabel, osName } from '../../src/cloud/device-info';
import { deriveKeys, open, seal } from '../../src/cloud/crypto';
import { DB_NAME, openWebcockpitDb } from '../../src/core/db';

class MemoryStorage {
  m = new Map<string, string>();
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

async function record(name = 'Olev'): Promise<StoredAccount> {
  const keys = await deriveKeys(crypto.getRandomValues(new Uint8Array(32)));
  return { name, created: 1_700_000_000_000, label: 'Firefox on Linux', savedAt: 1_700_000_100_000, dataKey: keys.dataKey, idKey: keys.idKey };
}

const names = async (f: IDBFactory): Promise<string[]> => (await f.databases()).map((d) => d.name ?? '').sort();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetAccountStateForTest();
  resetConfigForTest();
});

describe('the store', () => {
  it('is a database of its own, named after the main one', () => {
    expect(ACCOUNT_DB_NAME).toBe('webcockpit-account');
    expect(ACCOUNT_DB_NAME.startsWith(`${DB_NAME}-`)).toBe(true);
  });

  it('the keys survive a reopen as non-extractable CryptoKeys that still work', async () => {
    const factory = new IDBFactory();
    const rec = await record();
    const sealed = await seal(rec.dataKey, 'k', 'i', new TextEncoder().encode('secret'));
    await createAccountStore(factory).write(rec);

    // Another connection, as after a reload.
    const got = await createAccountStore(factory).read();
    expect(got).not.toBeNull();
    expect(got).toMatchObject({ name: 'Olev', created: 1_700_000_000_000, label: 'Firefox on Linux', savedAt: 1_700_000_100_000 });
    for (const key of [got!.dataKey, got!.idKey]) {
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.extractable).toBe(false);
      expect(key.type).toBe('secret');
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    }
    expect(got!.dataKey.algorithm.name).toBe('AES-GCM');
    expect(got!.idKey.algorithm.name).toBe('HMAC');
    expect(new TextDecoder().decode(await open(got!.dataKey, 'k', 'i', sealed))).toBe('secret');
    expect(Object.keys(got!).sort()).toEqual(['created', 'dataKey', 'idKey', 'label', 'name', 'savedAt']);
  });

  it('a write replaces the account; only what the record is made of is stored', async () => {
    const factory = new IDBFactory();
    const store = createAccountStore(factory);
    await store.write(await record('Olev'));
    await store.write({ ...(await record('Other')), password: 'never', wrapPw: 'never' } as StoredAccount);
    const got = await store.read();
    expect(got!.name).toBe('Other');
    expect(Object.keys(got!).sort()).toEqual(['created', 'dataKey', 'idKey', 'label', 'name', 'savedAt']);
  });

  it('remove deletes the database', async () => {
    const factory = new IDBFactory();
    const store = createAccountStore(factory);
    await store.write(await record());
    expect(await names(factory)).toEqual(['webcockpit-account']);
    expect(await store.remove()).toBe(true);
    expect(await names(factory)).toEqual([]);
    expect(await store.read()).toBeNull();
    expect(await store.remove()).toBe(true);
  });

  it('a read where there is no account leaves no database behind', async () => {
    const factory = new IDBFactory();
    expect(await createAccountStore(factory).read()).toBeNull();
    expect(await names(factory)).toEqual([]);
  });

  it('never touches the main database, and the main database never sees the account', async () => {
    const factory = new IDBFactory();
    const main = await openWebcockpitDb(factory);
    const version = main.version;
    const stores = [...main.objectStoreNames];
    main.close();
    const store = createAccountStore(factory);
    expect(await store.works()).toBe(true);
    await store.write(await record());
    await store.read();
    expect(await names(factory)).toEqual(['webcockpit', 'webcockpit-account']);
    const again = await openWebcockpitDb(factory);
    expect(again.version).toBe(version);
    expect([...again.objectStoreNames]).toEqual(stores);
    again.close();
    await store.remove();
    expect(await names(factory)).toEqual(['webcockpit']);
  });

  it('refuses to write, and to read back, a record that is not one (an extractable key, a bad name)', async () => {
    const factory = new IDBFactory();
    const store = createAccountStore(factory);
    const rec = await record();
    const loose = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    await expect(store.write({ ...rec, dataKey: loose })).rejects.toThrow();
    await expect(store.write({ ...rec, name: 'a b' })).rejects.toThrow();
    await expect(store.write({ ...rec, idKey: rec.dataKey })).rejects.toThrow();
    expect(isStoredAccount(rec)).toBe(true);
    expect(isStoredAccount({ ...rec, dataKey: {} })).toBe(false);
    expect(isStoredAccount(null)).toBe(false);
    expect(await store.read()).toBeNull();
  });

  it('works: true where keys can be stored, false without IndexedDB; the probe leaves nothing', async () => {
    const factory = new IDBFactory();
    expect(await createAccountStore(factory).works()).toBe(true);
    expect(await names(factory)).toEqual([]);
    const none = createAccountStore(undefined);
    expect(await none.works()).toBe(false);
    expect(await none.read()).toBeNull();
    expect(await none.remove()).toBe(true);
    await expect(none.write(await record())).rejects.toThrow();
  });
});

describe('the start page\'s state', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('reads the hint; a hint that is not ours is nobody', () => {
    expect(accountState()).toEqual({ enabled: null, name: null, lastName: null });
    noteLoggedIn('Olev');
    expect(accountState()).toEqual({ enabled: null, name: 'Olev', lastName: 'Olev' });
    expect(storage.getItem(ACCOUNT_HINT_KEY)).toBe('{"name":"Olev"}');
    for (const bad of ['{', '{"name":"<b>"}', '{"name":7}', '"Olev"', 'null', '{"name":"ab"}']) {
      storage.setItem(ACCOUNT_HINT_KEY, bad);
      expect(accountState().name, bad).toBeNull();
    }
    storage.setItem(ACCOUNT_LAST_KEY, 'not a name!');
    expect(accountState().lastName).toBeNull();
  });

  it('reads a name as the API does', () => {
    expect(HINT_NAME_PATTERN.source).toBe(NAME_PATTERN.source);
    expect(HINT_NAME_PATTERN.flags).toBe(NAME_PATTERN.flags);
  });

  it('logged out keeps the last name, unless it is to be forgotten', () => {
    noteLoggedIn('Olev');
    noteLoggedOut();
    expect(accountState()).toMatchObject({ name: null, lastName: 'Olev' });
    noteLoggedIn('Olev');
    noteLoggedOut({ forgetName: true });
    expect(accountState()).toMatchObject({ name: null, lastName: null });
  });

  it('tells its listeners, and survives one that throws', () => {
    const seen: (string | null)[] = [];
    onAccountState(() => {
      throw new Error('mine');
    });
    const off = onAccountState((s) => seen.push(s.name));
    noteLoggedIn('Olev');
    noteLoggedOut();
    off();
    noteLoggedIn('Olev');
    expect(seen).toEqual(['Olev', null]);
  });

  it('another tab\'s change arrives through the storage event', async () => {
    const listeners: ((e: { key: string | null }) => void)[] = [];
    vi.stubGlobal('addEventListener', (type: string, fn: (e: { key: string | null }) => void) => {
      if (type === 'storage') listeners.push(fn);
    });
    vi.stubGlobal('navigator', { webdriver: true });
    await watchAccountState();
    await watchAccountState();
    expect(listeners).toHaveLength(1);
    const seen: (string | null)[] = [];
    onAccountState((s) => seen.push(s.name));
    // The other tab logged in: the storage already holds its hint when the event fires.
    storage.setItem(ACCOUNT_HINT_KEY, '{"name":"Olev"}');
    listeners[0]!({ key: ACCOUNT_HINT_KEY });
    listeners[0]!({ key: 'wc.settings' });
    storage.removeItem(ACCOUNT_HINT_KEY);
    listeners[0]!({ key: null });
    expect(seen).toEqual(['Olev', null]);
  });

  it('enabled: off in an automated browser without a request; on with the flag; off without it', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async (): Promise<unknown> => ({ flags: { accounts: true } }) }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { webdriver: true });
    expect(await accountsEnabled()).toBe(false);
    expect((await watchAccountState()).enabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    // The dev server without an API: no request either.
    resetAccountStateForTest();
    resetConfigForTest();
    vi.stubGlobal('navigator', { webdriver: false });
    expect((await watchAccountState()).enabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    resetAccountStateForTest();
    resetConfigForTest();
    vi.stubGlobal('navigator', { webdriver: false });
    // As a production build: the dev server without `dev:cloud` has no API and makes no request.
    vi.stubEnv('DEV', false);
    const seen: (boolean | null)[] = [];
    onAccountState((s) => seen.push(s.enabled));
    expect(accountState().enabled).toBeNull();
    expect((await watchAccountState()).enabled).toBe(true);
    expect(seen).toEqual([true]);
    expect(fetch).toHaveBeenCalledTimes(1);

    resetAccountStateForTest();
    resetConfigForTest();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ flags: { stats: true } }) });
    expect((await watchAccountState()).enabled).toBe(false);
  });

  it('works without any storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(accountState()).toEqual({ enabled: null, name: null, lastName: null });
    noteLoggedIn('Olev');
    noteLoggedOut();
    expect(accountState().name).toBeNull();
  });
});

describe('checks', () => {
  it('user name', () => {
    expect(checkName('')).toBe('empty');
    expect(checkName('ab')).toBe('too_short');
    expect(checkName('a'.repeat(21))).toBe('too_long');
    expect(checkName('ole v')).toBe('bad_characters');
    expect(checkName('olé')).toBe('bad_characters');
    expect(checkName('Kelvin')).toBe('bad_characters');
    expect(checkName(' olev')).toBe('bad_characters');
    for (const ok of ['abc', 'Olev', 'o-l_e-v', 'A1234567890123456789']) expect(checkName(ok), ok).toBeNull();
  });

  it('password: at least ten characters, counted after NFKC as code points', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(checkPassword('')).toBe('empty');
    expect(checkPassword('123456789')).toBe('too_short');
    expect(checkPassword('1234567890')).toBeNull();
    // Nine emoji and a letter are ten characters (twenty UTF-16 units would be too many to ask).
    expect(passwordLength('😀'.repeat(9) + 'a')).toBe(10);
    // A ligature is the letters it stands for after NFKC.
    expect(passwordLength('ﬁ')).toBe(2);
    expect(checkPassword('ﬁﬁﬁﬁﬁ')).toBeNull();
    // A decomposed letter is one after NFKC.
    expect(passwordLength('é')).toBe(1);
    expect(checkPassword('é'.repeat(9))).toBe('too_short');
  });

  it('the two passwords are equal as the key will read them', () => {
    expect(passwordsMatch('correct horse', 'correct horse')).toBe(true);
    expect(passwordsMatch('correct horse', 'correct horse ')).toBe(false);
    expect(passwordsMatch('café au lait', 'café au lait')).toBe(true);
    expect(passwordsMatch('Password12', 'password12')).toBe(false);
  });

  it('the strength hint follows its rule: length and variety', () => {
    expect(passwordStrength('short')).toBe('too_short');
    expect(passwordStrength('aaaaaaaaaaaaaaaaaaaaaaaa')).toBe('weak');
    expect(passwordStrength('abababababab')).toBe('weak');
    expect(passwordStrength('abcdefghij')).toBe('weak');
    expect(passwordStrength('Abcdefgh1j')).toBe('fair');
    expect(passwordStrength('abcdefghijklmn')).toBe('fair');
    expect(passwordStrength('Abcdefghijklm1')).toBe('good');
    expect(passwordStrength('correct horse battery')).toBe('good');
    expect(passwordStrength('Correct horse battery 7')).toBe('strong');
    // The user name inside it: weak, whatever else.
    expect(passwordStrength('Olev-Correct horse battery 7', 'olev')).toBe('weak');
    expect(passwordStrength('Correct horse battery 7', 'olev')).toBe('strong');
    expect(passwordStrength('Correct horse battery 7', '')).toBe('strong');
  });

  it('recovery code: the canonical form, or null while it is not a whole code', () => {
    expect(checkRecoveryCode('7k2m 9qxa 0d4h vt3p b6rw 1zce')).toBe('7K2M-9QXA-0D4H-VT3P-B6RW-1ZCE');
    expect(checkRecoveryCode('7K2M9QXAOD4HVT3PB6RWIZCE')).toBe('7K2M-9QXA-0D4H-VT3P-B6RW-1ZCE');
    expect(checkRecoveryCode('7K2M-9QXA')).toBeNull();
    expect(checkRecoveryCode('7K2M-9QXA-0D4H-VT3P-B6RW-1ZCU')).toBeNull();
    expect(checkRecoveryCode('')).toBeNull();
  });
});

describe('the device label', () => {
  const UA = {
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
    edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  };

  it('"Firefox on Linux" and its kin', () => {
    expect(deviceLabel(UA.firefoxLinux)).toBe('Firefox on Linux');
    expect(deviceLabel(UA.chromeWindows)).toBe('Chrome on Windows');
    expect(deviceLabel(UA.safariMac)).toBe('Safari on macOS');
    expect(deviceLabel(UA.safariIphone)).toBe('Safari on iOS');
    expect(deviceLabel(UA.chromeAndroid)).toBe('Chrome on Android');
    expect(deviceLabel(UA.samsung)).toBe('Samsung Internet on Android');
    expect(deviceLabel(UA.edgeWindows)).toBe('Edge on Windows');
    expect(deviceLabel(UA.chromeOs)).toBe('Chrome on ChromeOS');
    expect(deviceLabel('')).toBe('Browser');
    expect(deviceLabel('curl/8')).toBe('Browser');
    expect(osName('something else')).toBeNull();
    for (const ua of Object.values(UA)) expect(deviceLabel(ua)).toMatch(/^[\x20-\x7e]{1,40}$/);
  });

  it('a label is printable ASCII, trimmed, forty characters at most', () => {
    expect(cleanLabel('  Firefox\ton Linuxé\u0000  ')).toBe('Firefoxon Linux');
    expect(cleanLabel('x'.repeat(39) + ' yz')).toBe('x'.repeat(39));
    expect(cleanLabel('åäö')).toBe('');
  });
});

describe('the remembered KDF time', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('a first guess, then the last measured time, scaled to the rounds', () => {
    expect(estimateKdfMs()).toBe(KDF_GUESS_MS.desktop);
    expect(estimateKdfMs(1_200_000)).toBe(KDF_GUESS_MS.desktop * 2);
    noteKdfMs(250, 600_000);
    expect(storage.getItem(KDF_TIME_KEY)).toBe('250');
    expect(estimateKdfMs()).toBe(250);
    expect(estimateKdfMs(1_200_000)).toBe(500);
    noteKdfMs(900, 1_200_000);
    expect(estimateKdfMs()).toBe(450);
  });

  it('does not believe a measurement or a stored value out of range', () => {
    noteKdfMs(0.2, 600_000);
    noteKdfMs(Number.NaN, 600_000);
    noteKdfMs(500_000, 600_000);
    noteKdfMs(100, 0);
    expect(storage.getItem(KDF_TIME_KEY)).toBeNull();
    for (const bad of ['fast', '-3', '1e12', '']) {
      storage.setItem(KDF_TIME_KEY, bad);
      expect(estimateKdfMs(), bad).toBe(KDF_GUESS_MS.desktop);
    }
  });

  it('works without storage', () => {
    vi.stubGlobal('localStorage', undefined);
    noteKdfMs(250, 600_000);
    expect(estimateKdfMs()).toBe(KDF_GUESS_MS.desktop);
  });
});
