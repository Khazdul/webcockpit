// Stage 60 (spec §7.3, ADR 0145 "As built (stage 60, crypto)"): the
// properties of the account crypto. Round trips; every kind of tampering
// fails, with the right error; keys cannot be exported; the recovery
// code's mapping and parser; the KDF's bounds. The formats' bytes are
// cloud-crypto-vectors.test.ts's.
import { describe, expect, it } from 'vitest';
import {
  type AccountKeys,
  type PasswordKdf,
  CloudCryptoError,
  DEFAULT_KDF,
  MAX_ROUNDS,
  MIN_ROUNDS,
  RECOVERY_ALPHABET,
  accountLabel,
  changePassword,
  checkKdf,
  decryptBody,
  decryptBodyStream,
  derivePasswordKeys,
  derivePasswordLogin,
  deriveKeys,
  deriveRecoveryKeys,
  deriveRecoveryLogin,
  encryptBody,
  encryptBodyStream,
  fromBase64Url,
  isCryptoError,
  kdfWorkerAlive,
  lastGroup,
  lastGroupMatches,
  makeRecoveryCode,
  makeRoot,
  newRecoveryCode,
  opaqueId,
  open,
  openBody,
  openRoot,
  parseRecoveryCode,
  prepareRegistration,
  recoverAccount,
  seal,
  sealBody,
  sealedBodySize,
  toBase64Url,
  unlockWithPassword,
  unwrapRoot,
  wrapRoot,
} from '../../src/cloud/crypto';
import { NONCE_BYTES, gcmEncrypt } from '../../src/cloud/crypto/blob';
import { type Bytes, concat, field, u32, utf8 } from '../../src/cloud/crypto/bytes';
import { derivePasswordKeysUnchecked, hkdfAesKey } from '../../src/cloud/crypto/kdf';
import { encodeRecoveryCode, recoveryCodeBytes } from '../../src/cloud/crypto/recovery';
import { segmentAad } from '../../src/cloud/crypto/segments';

/** The password KDF at 1000 rounds: these tests are about everything but its cost. */
const fast: PasswordKdf = (password, salt) => derivePasswordKeysUnchecked(password, salt, 1000);

const bytes = (n: number, start = 0): Bytes => Uint8Array.from({ length: n }, (_, i) => (start + i * 7) & 0xff);
const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CloudCryptoError) return e.code;
    throw e;
  }
  return 'no error';
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof CloudCryptoError) return e.code;
    throw e;
  }
  return 'no error';
}

const flip = (b: Bytes, at: number, bit = 1): Bytes => {
  const out = b.slice();
  out[at] = out[at]! ^ bit;
  return out;
};

let cached: Promise<AccountKeys> | null = null;
const keys = (): Promise<AccountKeys> => (cached ??= deriveKeys(bytes(32, 9)));

describe('base64url', () => {
  it('round trips every length, without padding', () => {
    for (let n = 0; n < 70; n++) {
      const b = random(n);
      const t = toBase64Url(b);
      expect(t).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(fromBase64Url(t)).toEqual(b);
    }
    const big = bytes(200_000);
    expect(fromBase64Url(toBase64Url(big))).toEqual(big);
  });

  it('refuses padding, other alphabets, impossible lengths and stray bits', () => {
    for (const bad of ['AA==', 'A', 'AAAAA', '+/8', 'A A', 'AB', 'AAB', 'é']) expect(codeOf(() => fromBase64Url(bad)), bad).toBe('malformed');
    expect(codeOf(() => fromBase64Url(undefined as unknown as string))).toBe('malformed');
  });
});

describe('field encoding', () => {
  it('is length-prefixed, so a shifted boundary gives other bytes', () => {
    expect([...field('ab')]).toEqual([0, 2, 0x61, 0x62]);
    expect(concat(field('ab'), field('c'))).not.toEqual(concat(field('a'), field('bc')));
    expect([...field('å')]).toEqual([0, 2, 0xc3, 0xa5]);
  });

  it('refuses over-long and ill-formed text', () => {
    expect(field('x'.repeat(65535))).toHaveLength(65537);
    expect(codeOf(() => field('x'.repeat(65536)))).toBe('bad_input');
    expect(codeOf(() => field('a\ud800'))).toBe('bad_input');
    expect(codeOf(() => u32(-1))).toBe('bad_input');
    expect(codeOf(() => u32(2 ** 32))).toBe('bad_input');
  });

  it('the account name is lowercased and must be a user name', () => {
    expect(accountLabel('Gandalf_the-Grey')).toBe('gandalf_the-grey');
    for (const bad of ['', 'ab', 'x'.repeat(21), 'with space', 'åke', 'a/b', 'İstanbul']) expect(codeOf(() => accountLabel(bad)), bad).toBe('bad_input');
  });
});

describe('blobs', () => {
  it('round trip, with a fresh nonce every time', async () => {
    const { dataKey } = await keys();
    for (const n of [0, 1, 15, 16, 17, 1000, 70_000]) {
      const plain = bytes(n);
      const blob = await seal(dataKey, 'profile', 'id-1', plain);
      expect(blob).toHaveLength(n + 29);
      expect(blob[0]).toBe(1);
      expect(await open(dataKey, 'profile', 'id-1', blob)).toEqual(plain);
    }
    const a = await seal(dataKey, 'profile', 'id-1', bytes(8));
    const b = await seal(dataKey, 'profile', 'id-1', bytes(8));
    expect(a.slice(1, 13)).not.toEqual(b.slice(1, 13));
  });

  it('a changed bit anywhere fails: the version as unknown, the rest as authentication', async () => {
    const { dataKey } = await keys();
    const blob = await seal(dataKey, 'profile', 'id-1', bytes(20));
    for (let at = 0; at < blob.length; at++) {
      for (const bit of [1, 0x80]) {
        expect(await code(open(dataKey, 'profile', 'id-1', flip(blob, at, bit))), `byte ${at}`).toBe(at === 0 ? 'unknown_version' : 'auth');
      }
    }
  });

  it('the wrong kind, id or key fails', async () => {
    const { dataKey } = await keys();
    const other = await deriveKeys(bytes(32, 10));
    const blob = await seal(dataKey, 'profile', 'id-1', bytes(20));
    expect(await code(open(dataKey, 'script', 'id-1', blob))).toBe('auth');
    expect(await code(open(dataKey, 'profile', 'id-2', blob))).toBe('auth');
    expect(await code(open(dataKey, 'profil', 'eid-1', blob))).toBe('auth');
    expect(await code(open(dataKey, 'profileid-1', '', blob))).toBe('auth');
    expect(await code(open(other.dataKey, 'profile', 'id-1', blob))).toBe('auth');
    const split = await seal(dataKey, 'ab', 'c', bytes(4));
    expect(await code(open(dataKey, 'a', 'bc', split))).toBe('auth');
  });

  it('tells an unknown version from a malformed blob', async () => {
    const { dataKey } = await keys();
    const blob = await seal(dataKey, 'profile', 'id-1', bytes(20));
    expect(await code(open(dataKey, 'profile', 'id-1', new Uint8Array(0)))).toBe('malformed');
    expect(await code(open(dataKey, 'profile', 'id-1', blob.slice(0, 28)))).toBe('malformed');
    expect(await code(open(dataKey, 'profile', 'id-1', Uint8Array.of(1)))).toBe('malformed');
    // A later version may be shorter or longer than ours: the version is what is reported.
    expect(await code(open(dataKey, 'profile', 'id-1', Uint8Array.of(2)))).toBe('unknown_version');
    expect(await code(open(dataKey, 'profile', 'id-1', concat(Uint8Array.of(2), blob.slice(1))))).toBe('unknown_version');
    expect(await code(open(dataKey, 'profile', 'id-1', concat(Uint8Array.of(0), blob.slice(1))))).toBe('unknown_version');
    // Cut short but long enough to try: the tag does not hold.
    expect(await code(open(dataKey, 'profile', 'id-1', blob.slice(0, 40)))).toBe('auth');
    expect(await code(open(dataKey, 'profile', 'id-1', concat(blob, Uint8Array.of(0))))).toBe('auth');
  });

  it('refuses a kind or id it cannot encode, before encrypting', async () => {
    const { dataKey } = await keys();
    expect(await code(seal(dataKey, 'k', 'x'.repeat(65536), bytes(1)))).toBe('bad_input');
    expect(await code(seal(dataKey, '\udc00', 'id', bytes(1)))).toBe('bad_input');
  });
});

describe('root key and wraps', () => {
  it('wraps to 61 bytes and back; the name is bound without regard to case', async () => {
    const kek = await hkdfAesKey(bytes(32, 1), 'test-kek');
    const root = makeRoot();
    expect(root).toHaveLength(32);
    expect(makeRoot()).not.toEqual(root);
    const wrap = await wrapRoot(root, kek, 'wrap-pw', 'Frodo');
    expect(wrap).toHaveLength(61);
    expect(await unwrapRoot(wrap, kek, 'wrap-pw', 'frodo')).toEqual(root);
    expect(await unwrapRoot(wrap, kek, 'wrap-pw', 'FRODO')).toEqual(root);
  });

  it('the two wraps cannot be swapped, nor moved to another account, even under one key', async () => {
    const kek = await hkdfAesKey(bytes(32, 1), 'test-kek');
    const root = makeRoot();
    const pw = await wrapRoot(root, kek, 'wrap-pw', 'frodo');
    const rc = await wrapRoot(root, kek, 'wrap-rc', 'frodo');
    expect(await code(unwrapRoot(pw, kek, 'wrap-rc', 'frodo'))).toBe('auth');
    expect(await code(unwrapRoot(rc, kek, 'wrap-pw', 'frodo'))).toBe('auth');
    expect(await code(unwrapRoot(pw, kek, 'wrap-pw', 'frodo2'))).toBe('auth');
    expect(await code(unwrapRoot(pw, await hkdfAesKey(bytes(32, 2), 'test-kek'), 'wrap-pw', 'frodo'))).toBe('auth');
    // A wrap is not an item and an item is not a wrap.
    expect(await code(open(kek, 'profile', 'frodo', pw))).toBe('auth');
  });

  it('refuses bad arguments and a wrap that does not hold a root', async () => {
    const kek = await hkdfAesKey(bytes(32, 1), 'test-kek');
    expect(await code(wrapRoot(bytes(31), kek, 'wrap-pw', 'frodo'))).toBe('bad_input');
    expect(await code(wrapRoot(bytes(32), kek, 'wrap-pw', 'no'))).toBe('bad_input');
    expect(await code(wrapRoot(bytes(32), kek, 'profile' as 'wrap-pw', 'frodo'))).toBe('bad_input');
    expect(await code(deriveKeys(bytes(16)))).toBe('bad_input');
    const short = await seal(kek, 'wrap-pw', 'frodo', bytes(31));
    expect(await code(unwrapRoot(short, kek, 'wrap-pw', 'frodo'))).toBe('malformed');
  });

  it('openRoot gives the keys of the root, and they depend on nothing else', async () => {
    const kek = await hkdfAesKey(bytes(32, 1), 'test-kek');
    const root = bytes(32, 9);
    const wrap = await wrapRoot(root, kek, 'wrap-rc', 'frodo');
    const a = await openRoot(wrap, kek, 'wrap-rc', 'frodo');
    const b = await keys();
    expect(await opaqueId(a.idKey, 'profile', 'default')).toBe(await opaqueId(b.idKey, 'profile', 'default'));
    expect(await open(a.dataKey, 'k', 'i', await seal(b.dataKey, 'k', 'i', bytes(5)))).toEqual(bytes(5));
    const other = await deriveKeys(bytes(32, 10));
    expect(await opaqueId(other.idKey, 'profile', 'default')).not.toBe(await opaqueId(b.idKey, 'profile', 'default'));
  });

  it('no key can be exported', async () => {
    const { dataKey, idKey } = await keys();
    const { kek } = await derivePasswordKeysUnchecked('password', bytes(16), 1000);
    const { recoveryKek } = await deriveRecoveryKeys(makeRecoveryCode(), 'frodo');
    for (const key of [dataKey, idKey, kek, recoveryKek]) {
      expect(key.extractable).toBe(false);
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
      await expect(crypto.subtle.exportKey('jwk', key)).rejects.toThrow();
    }
    expect(dataKey.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect([...dataKey.usages].sort()).toEqual(['decrypt', 'encrypt']);
    expect(idKey.algorithm).toMatchObject({ name: 'HMAC', length: 256 });
    expect(idKey.usages).toEqual(['sign']);
    expect([...kek.usages].sort()).toEqual(['decrypt', 'encrypt']);
  });
});

describe('opaque ids', () => {
  it('are 22 characters, stable, and differ by kind, key and account', async () => {
    const { idKey } = await keys();
    const id = await opaqueId(idKey, 'profile', 'default');
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(fromBase64Url(id)).toHaveLength(16);
    expect(await opaqueId(idKey, 'profile', 'default')).toBe(id);
    expect(await opaqueId(idKey, 'script', 'default')).not.toBe(id);
    expect(await opaqueId(idKey, 'profile', 'Default')).not.toBe(id);
    expect(await opaqueId(idKey, 'ab', 'c')).not.toBe(await opaqueId(idKey, 'a', 'bc'));
  });
});

describe('recovery code', () => {
  it('the alphabet is 32 different characters without I, L, O and U', () => {
    expect(RECOVERY_ALPHABET).toHaveLength(32);
    expect(new Set(RECOVERY_ALPHABET).size).toBe(32);
    expect(RECOVERY_ALPHABET).toMatch(/^[0-9A-Z]+$/);
    for (const c of 'ILOU') expect(RECOVERY_ALPHABET).not.toContain(c);
  });

  it('every character is exactly five of the 120 bits: no modulo, no bias', () => {
    // Each of the 24 positions takes each of the 32 values from its own five bits and nothing else.
    for (let pos = 0; pos < 24; pos++) {
      for (let v = 0; v < 32; v++) {
        const b = new Uint8Array(15);
        for (let bit = 0; bit < 5; bit++) {
          if ((v >> (4 - bit)) & 1) {
            const at = pos * 5 + bit;
            b[at >> 3] = b[at >> 3]! | (0x80 >> (at & 7));
          }
        }
        const chars = encodeRecoveryCode(b).replace(/-/g, '');
        expect(chars).toHaveLength(24);
        expect(chars[pos]).toBe(RECOVERY_ALPHABET[v]);
        for (let other = 0; other < 24; other++) if (other !== pos) expect(chars[other]).toBe('0');
        expect(recoveryCodeBytes(chars)).toEqual(b);
      }
    }
    for (let i = 0; i < 200; i++) {
      const b = random(15);
      expect(recoveryCodeBytes(encodeRecoveryCode(b))).toEqual(b);
    }
  });

  it('a new code takes 15 random bytes and is shown in six groups of four', () => {
    const asked: number[] = [];
    const made = makeRecoveryCode((n) => {
      asked.push(n);
      return Uint8Array.from({ length: n }, (_, i) => i * 17);
    });
    expect(asked).toEqual([15]);
    expect(made).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(makeRecoveryCode()).not.toBe(makeRecoveryCode());
    expect(codeOf(() => encodeRecoveryCode(new Uint8Array(16)))).toBe('bad_input');
  });

  it('the parser takes what a player types and gives the canonical code or null', () => {
    const canonical = '0492-6D25-ASKQ-H2CT-NEYC-VQQF';
    for (const typed of [
      canonical,
      canonical.toLowerCase(),
      '04926D25ASKQH2CTNEYCVQQF',
      '  0492 6d25 askq h2ct neyc vqqf\n',
      'O492-6D25-ASKQ-H2CT-NEYC-VQQF', // O for 0
      '0492–6D25—ASKQ‑H2CT−NEYC_VQQF', // dashes of other kinds
      '0492.6D25.ASKQ.H2CT.NEYC.VQQF',
    ]) {
      expect(parseRecoveryCode(typed), typed).toBe(canonical);
    }
    expect(parseRecoveryCode('i111-l111-I111-L111-o000-O000')).toBe('1111-1111-1111-1111-0000-0000');
    for (const bad of ['', canonical.slice(1), canonical + '0', canonical.replace('Q', 'U'), canonical.replace('Q', '!'), canonical.replace('Q', 'Ö')]) {
      expect(parseRecoveryCode(bad), bad).toBeNull();
    }
    expect(parseRecoveryCode(undefined as unknown as string)).toBeNull();
  });

  it('the last group, for the "type the last group" confirmation', () => {
    const canonical = '0492-6D25-ASKQ-H2CT-NEYC-V0Q1';
    expect(lastGroup(canonical)).toBe('V0Q1');
    expect(lastGroup(canonical.toLowerCase())).toBe('V0Q1');
    expect(codeOf(() => lastGroup('nope'))).toBe('bad_input');
    for (const typed of ['V0Q1', 'v0q1', ' voql ', 'V0-Q1']) expect(lastGroupMatches(canonical, typed), typed).toBe(true);
    for (const typed of ['', 'V0Q', 'V0Q11', 'NEYC', 'V0Q2', 'VUQ1']) expect(lastGroupMatches(canonical, typed), typed).toBe(false);
    expect(lastGroupMatches('nope', 'V0Q1')).toBe(false);
  });

  it('the keys depend on the code and on the account, not on how the code was typed', async () => {
    const c = makeRecoveryCode();
    const a = await deriveRecoveryKeys(c, 'Frodo');
    const b = await deriveRecoveryKeys(c.toLowerCase().replace(/-/g, ''), 'frodo');
    expect(b.recoveryAuth).toEqual(a.recoveryAuth);
    expect(a.recoveryAuth).toHaveLength(32);
    expect((await deriveRecoveryKeys(c, 'frodo2')).recoveryAuth).not.toEqual(a.recoveryAuth);
    expect((await deriveRecoveryKeys(makeRecoveryCode(), 'frodo')).recoveryAuth).not.toEqual(a.recoveryAuth);
    expect(await code(deriveRecoveryKeys('not a code', 'frodo'))).toBe('bad_input');
    expect(await code(deriveRecoveryKeys(c, 'x'))).toBe('bad_input');
  });
});

describe('KDF parameters', () => {
  const salt = bytes(16);

  it('accepts pbkdf2-sha256 within the bounds only', () => {
    expect(checkKdf({ name: 'pbkdf2-sha256', rounds: MIN_ROUNDS }, salt)).toEqual(DEFAULT_KDF);
    expect(checkKdf({ name: 'pbkdf2-sha256', rounds: MAX_ROUNDS, extra: 1 }, salt)).toEqual({ name: 'pbkdf2-sha256', rounds: MAX_ROUNDS });
    expect(MIN_ROUNDS).toBe(600_000);
    for (const bad of [
      null,
      undefined,
      'pbkdf2-sha256',
      {},
      { name: 'pbkdf2-sha256' },
      { name: 'pbkdf2-sha256', rounds: 1 },
      { name: 'pbkdf2-sha256', rounds: MIN_ROUNDS - 1 },
      { name: 'pbkdf2-sha256', rounds: MAX_ROUNDS + 1 },
      { name: 'pbkdf2-sha256', rounds: 600000.5 },
      { name: 'pbkdf2-sha256', rounds: '600000' },
      { name: 'pbkdf2-sha256', rounds: Number.NaN },
      { name: 'pbkdf2-sha256', rounds: Number.POSITIVE_INFINITY },
      { name: 'pbkdf2-sha1', rounds: 600000 },
      { name: 'argon2id', rounds: 600000 },
      { name: 'PBKDF2-SHA256', rounds: 600000 },
    ]) {
      expect(codeOf(() => checkKdf(bad, salt)), JSON.stringify(bad)).toBe('bad_kdf');
    }
    for (const badSalt of [bytes(15), bytes(17), bytes(0), 'AAAAAAAAAAAAAAAAAAAAAA', null]) {
      expect(codeOf(() => checkKdf(DEFAULT_KDF, badSalt))).toBe('bad_kdf');
    }
  });

  it('the derivation refuses them before doing any work, on every path', async () => {
    const weak = { name: 'pbkdf2-sha256', rounds: 1 } as const;
    expect(await code(derivePasswordKeys('password', salt, weak))).toBe('bad_kdf');
    expect(await code(derivePasswordKeys('password', salt, weak, { inline: true }))).toBe('bad_kdf');
    expect(await code(derivePasswordKeys('password', bytes(8), DEFAULT_KDF))).toBe('bad_kdf');
    expect(await code(derivePasswordLogin('password', { salt: toBase64Url(salt), kdf: weak }))).toBe('bad_kdf');
    expect(await code(derivePasswordLogin('password', { salt: toBase64Url(salt), kdf: { name: 'pbkdf2-sha256', rounds: 1e9 } }))).toBe('bad_kdf');
    expect(await code(derivePasswordLogin('password', { salt: 'not base64!', kdf: DEFAULT_KDF }))).toBe('malformed');
    expect(await code(prepareRegistration('frodo', 'password', { kdf: weak }))).toBe('bad_kdf');
  });

  it('a request cancelled beforehand does no work; without workers nothing is started', async () => {
    const gone = new AbortController();
    gone.abort();
    expect(await code(derivePasswordKeys('password', salt, DEFAULT_KDF, { signal: gone.signal }))).toBe('cancelled');
    expect(kdfWorkerAlive()).toBe(false);
  });
});

describe('account flows', () => {
  const opts = { derive: fast };

  it('register, then log in: the same keys; another password is the wrong password', async () => {
    const reg = await prepareRegistration('Frodo', 'the first password', opts);
    expect(reg.request.kdf).toEqual(DEFAULT_KDF);
    expect(parseRecoveryCode(reg.recoveryCode)).toBe(reg.recoveryCode);
    const params = { salt: reg.request.salt, kdf: reg.request.kdf };
    const login = await derivePasswordLogin('the first password', params, opts);
    expect(login.authKey).toBe(reg.request.authKey);
    const k = await unlockWithPassword('frodo', login.kek, reg.request.wrapPw);
    expect(await opaqueId(k.idKey, 'profile', 'default')).toBe(await opaqueId(reg.keys.idKey, 'profile', 'default'));
    expect(await open(k.dataKey, 'k', 'i', await seal(reg.keys.dataKey, 'k', 'i', bytes(9)))).toEqual(bytes(9));

    const wrong = await derivePasswordLogin('the first passwore', params, opts);
    expect(wrong.authKey).not.toBe(reg.request.authKey);
    expect(await code(unlockWithPassword('frodo', wrong.kek, reg.request.wrapPw))).toBe('wrong_password');
  });

  it('tells a wrong password from a wrap that is malformed or from a newer client', async () => {
    const reg = await prepareRegistration('frodo', 'the first password', opts);
    const { kek } = await derivePasswordLogin('the first password', reg.request, opts);
    const wrap = fromBase64Url(reg.request.wrapPw);
    expect(await code(unlockWithPassword('frodo', kek, 'not base64!'))).toBe('malformed');
    expect(await code(unlockWithPassword('frodo', kek, toBase64Url(wrap.slice(0, 20))))).toBe('malformed');
    expect(await code(unlockWithPassword('frodo', kek, ''))).toBe('malformed');
    expect(await code(unlockWithPassword('frodo', kek, toBase64Url(flip(wrap, 0, 3))))).toBe('unknown_version');
    expect(await code(unlockWithPassword('frodo', kek, toBase64Url(flip(wrap, 30))))).toBe('wrong_password');
    expect(await code(unlockWithPassword('samwise', kek, reg.request.wrapPw))).toBe('wrong_password');
    expect(await code(unlockWithPassword('frodo', kek, reg.request.wrapRc))).toBe('wrong_password');
    expect(await code(unlockWithPassword('!', kek, reg.request.wrapPw))).toBe('bad_input');
  });

  it('every registration has its own salt, root, code and nonces', async () => {
    const a = await prepareRegistration('frodo', 'one password', opts);
    const b = await prepareRegistration('frodo', 'one password', opts);
    for (const f of ['salt', 'authKey', 'recoveryAuth', 'wrapPw', 'wrapRc'] as const) expect(a.request[f], f).not.toBe(b.request[f]);
    expect(a.recoveryCode).not.toBe(b.recoveryCode);
    expect(await opaqueId(a.keys.idKey, 'k', 'x')).not.toBe(await opaqueId(b.keys.idKey, 'k', 'x'));
  });

  it('change password: a new salt and wrap, the same account keys; the old password no longer opens it', async () => {
    const reg = await prepareRegistration('frodo', 'old password', opts);
    const old = await derivePasswordLogin('old password', reg.request, opts);
    const { set } = await changePassword('frodo', old.kek, reg.request.wrapPw, 'new password', opts);
    expect(set.salt).not.toBe(reg.request.salt);
    expect(set.authKey).not.toBe(reg.request.authKey);
    expect(fromBase64Url(set.wrapPw)).toHaveLength(61);
    const next = await derivePasswordLogin('new password', set, opts);
    expect(next.authKey).toBe(set.authKey);
    const k = await unlockWithPassword('frodo', next.kek, set.wrapPw);
    expect(await opaqueId(k.idKey, 'k', 'x')).toBe(await opaqueId(reg.keys.idKey, 'k', 'x'));
    expect(await code(unlockWithPassword('frodo', old.kek, set.wrapPw))).toBe('wrong_password');
    const wrong = await derivePasswordLogin('not the old password', reg.request, opts);
    expect(await code(changePassword('frodo', wrong.kek, reg.request.wrapPw, 'new password', opts))).toBe('wrong_password');
  });

  it('recovery: the code opens the recovery wrap and sets a new password; a wrong code does not', async () => {
    const reg = await prepareRegistration('frodo', 'forgotten password', opts);
    const rec = await deriveRecoveryLogin('Frodo', reg.recoveryCode.toLowerCase());
    expect(rec.recoveryAuth).toBe(reg.request.recoveryAuth);
    const { set, keys: k } = await recoverAccount('frodo', rec.recoveryKek, reg.request.wrapRc, 'a better password', opts);
    expect(await opaqueId(k.idKey, 'k', 'x')).toBe(await opaqueId(reg.keys.idKey, 'k', 'x'));
    const login = await derivePasswordLogin('a better password', set, opts);
    expect(login.authKey).toBe(set.authKey);
    const again = await unlockWithPassword('frodo', login.kek, set.wrapPw);
    expect(await opaqueId(again.idKey, 'k', 'x')).toBe(await opaqueId(reg.keys.idKey, 'k', 'x'));

    const other = await deriveRecoveryLogin('frodo', makeRecoveryCode());
    expect(other.recoveryAuth).not.toBe(reg.request.recoveryAuth);
    expect(await code(recoverAccount('frodo', other.recoveryKek, reg.request.wrapRc, 'x', opts))).toBe('wrong_code');
    // The password wrap is not the recovery wrap.
    expect(await code(recoverAccount('frodo', rec.recoveryKek, reg.request.wrapPw, 'x', opts))).toBe('wrong_code');
    expect(await code(recoverAccount('frodo', rec.recoveryKek, 'AQ', 'x', opts))).toBe('malformed');
    expect(await code(deriveRecoveryLogin('frodo', 'not a code'))).toBe('bad_input');
  });

  it('a new recovery code replaces the old one for the same account keys', async () => {
    const reg = await prepareRegistration('frodo', 'the password', opts);
    const { kek } = await derivePasswordLogin('the password', reg.request, opts);
    const fresh = await newRecoveryCode('frodo', kek, reg.request.wrapPw);
    expect(fresh.recoveryCode).not.toBe(reg.recoveryCode);
    expect(fresh.recoveryAuth).not.toBe(reg.request.recoveryAuth);
    const rec = await deriveRecoveryLogin('frodo', fresh.recoveryCode);
    expect(rec.recoveryAuth).toBe(fresh.recoveryAuth);
    const { keys: k } = await recoverAccount('frodo', rec.recoveryKek, fresh.wrapRc, 'p', opts);
    expect(await opaqueId(k.idKey, 'k', 'x')).toBe(await opaqueId(reg.keys.idKey, 'k', 'x'));
    const old = await deriveRecoveryLogin('frodo', reg.recoveryCode);
    expect(await code(recoverAccount('frodo', old.recoveryKek, fresh.wrapRc, 'p', opts))).toBe('wrong_code');
    const wrong = await derivePasswordLogin('not the password', reg.request, opts);
    expect(await code(newRecoveryCode('frodo', wrong.kek, reg.request.wrapPw))).toBe('wrong_password');
  });

  it('a bad account name fails before the KDF runs', async () => {
    let ran = 0;
    const counted: PasswordKdf = (p, s, k, o) => {
      ran++;
      return fast(p, s, k, o);
    };
    expect(await code(prepareRegistration('no', 'password', { derive: counted }))).toBe('bad_input');
    expect(ran).toBe(0);
  });

  it('isCryptoError', () => {
    const e = new CloudCryptoError('auth');
    expect(isCryptoError(e)).toBe(true);
    expect(isCryptoError(e, 'auth')).toBe(true);
    expect(isCryptoError(e, 'malformed')).toBe(false);
    expect(isCryptoError(new Error('auth'))).toBe(false);
    expect(e.message).toBe('auth');
  });
});

describe('segmented bodies', () => {
  const S = 8;
  const FRAME = S + 28;
  const o = { segmentSize: S };

  /** The body's parts: header and segments. */
  function parts(body: Bytes): { header: Bytes; segments: Bytes[] } {
    const segments: Bytes[] = [];
    for (let at = 5; at < body.length; at += FRAME) segments.push(body.slice(at, at + FRAME));
    return { header: body.slice(0, 5), segments };
  }

  async function drain(chunks: AsyncIterable<Uint8Array>): Promise<Bytes> {
    const out: Uint8Array[] = [];
    for await (const c of chunks) out.push(c);
    return concat(...out);
  }

  async function readAll(stream: ReadableStream<Uint8Array>): Promise<Bytes> {
    const reader = stream.getReader();
    const out: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return concat(...out);
      out.push(value);
    }
  }

  const streamOf = (data: Bytes, chunk: number): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(controller) {
        for (let at = 0; at < data.length; at += chunk) controller.enqueue(data.slice(at, at + chunk));
        controller.close();
      },
    });

  it('round trips every length around the segment boundaries, however the bytes arrive', async () => {
    const { dataKey } = await keys();
    for (let n = 0; n <= 5 * S + 1; n++) {
      const plain = bytes(n, n);
      const body = await sealBody(dataKey, 'run', 'r1', plain, o);
      expect(body, `${n} bytes`).toHaveLength(sealedBodySize(n, S));
      expect(parts(body).segments).toHaveLength(Math.max(1, Math.ceil(n / S)));
      expect(await openBody(dataKey, 'run', 'r1', body)).toEqual(plain);
      for (const chunk of [1, 3, S, FRAME, 1000]) {
        const sealed = await readAll(encryptBodyStream(dataKey, 'run', 'r1', streamOf(plain, chunk), o));
        expect(sealed).toHaveLength(body.length);
        expect(await readAll(decryptBodyStream(dataKey, 'run', 'r1', streamOf(sealed, chunk)))).toEqual(plain);
      }
    }
  });

  it('the default segment is 1 MB; a body of two and a bit round trips', async () => {
    const { dataKey } = await keys();
    const plain = bytes(2 * 1048576 + 100);
    const body = await sealBody(dataKey, 'run', 'r1', plain);
    expect(body).toHaveLength(5 + plain.length + 3 * 28);
    expect(new DataView(body.buffer).getUint32(1)).toBe(1048576);
    expect(sealedBodySize(plain.length)).toBe(body.length);
    expect(await openBody(dataKey, 'run', 'r1', body)).toEqual(plain);
  });

  it('a body cut anywhere does not open: at every byte, and at every segment boundary', async () => {
    const { dataKey } = await keys();
    for (const n of [0, 5, S, 3 * S, 3 * S + 3]) {
      const body = await sealBody(dataKey, 'run', 'r1', bytes(n), o);
      for (let cut = 0; cut < body.length; cut++) {
        const got = await code(openBody(dataKey, 'run', 'r1', body.slice(0, cut)));
        expect(['auth', 'malformed'], `${n} bytes cut at ${cut}: ${got}`).toContain(got);
      }
      // At a boundary the last frame is whole and authentic, but it was not sealed as the final one.
      const { segments } = parts(body);
      for (let keep = 1; keep < segments.length; keep++) {
        expect(await code(openBody(dataKey, 'run', 'r1', body.slice(0, 5 + keep * FRAME))), `${keep} of ${segments.length}`).toBe('auth');
      }
      expect(await code(openBody(dataKey, 'run', 'r1', body.slice(0, 5)))).toBe('malformed');
    }
  });

  it('segments reordered, duplicated, dropped or spliced in from another body do not open', async () => {
    const { dataKey } = await keys();
    const plain = bytes(4 * S + 2);
    const { header, segments } = parts(await sealBody(dataKey, 'run', 'r1', plain, o));
    const [s0, s1, s2, s3, s4] = segments as [Bytes, Bytes, Bytes, Bytes, Bytes];
    const tryBody = (...segs: Bytes[]) => code(openBody(dataKey, 'run', 'r1', concat(header, ...segs)));
    expect(await tryBody(s0, s1, s2, s3, s4)).toBe('no error');
    expect(await tryBody(s1, s0, s2, s3, s4)).toBe('auth'); // reordered
    expect(await tryBody(s0, s2, s1, s3, s4)).toBe('auth');
    expect(await tryBody(s0, s1, s1, s2, s3, s4)).toBe('auth'); // duplicated
    expect(await tryBody(s0, s1, s2, s3, s4, s4)).toBe('auth');
    expect(await tryBody(s0, s1, s2, s3)).toBe('auth'); // the last dropped
    expect(await tryBody(s1, s2, s3, s4)).toBe('auth'); // the first dropped
    expect(await tryBody(s0, s1, s3, s4)).toBe('auth'); // one from the middle
    expect(await tryBody(s0, s1, s2, s4)).toBe('auth');
    expect(await tryBody(s4)).toBe('auth'); // the final one alone
    expect(await tryBody(s0, s1, s2, s3, s4, Uint8Array.of(0))).toBe('auth'); // something after the end

    // The same position of another body, and of the same body under another id or kind.
    const other = parts(await sealBody(dataKey, 'run', 'r2', plain, o)).segments;
    expect(await tryBody(s0, other[1]!, s2, s3, s4)).toBe('auth');
    expect(await code(openBody(dataKey, 'run', 'r2', concat(header, ...segments)))).toBe('auth');
    expect(await code(openBody(dataKey, 'export', 'r1', concat(header, ...segments)))).toBe('auth');
    // A shorter body's final segment cannot end a longer one early.
    const short = parts(await sealBody(dataKey, 'run', 'r1', bytes(S + 2), o)).segments;
    expect(await tryBody(s0, short[1]!)).toBe('no error'); // that IS the shorter body: same id, a whole body
    expect(await tryBody(s0, s1, short[1]!)).toBe('auth');
  });

  it('a changed header or a changed bit in any segment does not open', async () => {
    const { dataKey } = await keys();
    const body = await sealBody(dataKey, 'run', 'r1', bytes(2 * S + 3), o);
    expect(await code(openBody(dataKey, 'run', 'r1', flip(body, 0)))).toBe('unknown_version');
    expect(await code(openBody(dataKey, 'run', 'r1', flip(body, 0, 2)))).toBe('unknown_version');
    for (let at = 1; at < body.length; at++) {
      const got = await code(openBody(dataKey, 'run', 'r1', flip(body, at)));
      expect(['auth', 'malformed'], `byte ${at}: ${got}`).toContain(got);
    }
    // Another segment size that happens to frame the same bytes.
    const one = await sealBody(dataKey, 'run', 'r1', bytes(S), o);
    expect(await code(openBody(dataKey, 'run', 'r1', concat(Uint8Array.of(1), u32(S + 1), one.slice(5))))).toBe('auth');
    expect(await code(openBody(dataKey, 'run', 'r1', concat(Uint8Array.of(1), u32(0), one.slice(5))))).toBe('malformed');
    expect(await code(openBody(dataKey, 'run', 'r1', concat(Uint8Array.of(1), u32(0xffffffff), one.slice(5))))).toBe('malformed');
    expect(await code(openBody(dataKey, 'run', 'r1', new Uint8Array(0)))).toBe('malformed');
    expect(await code(openBody(dataKey, 'run', 'r1', Uint8Array.of(1, 0)))).toBe('malformed');
    expect(await code(openBody(dataKey, 'run', 'r1', Uint8Array.of(7, 0)))).toBe('unknown_version');
    const other = await deriveKeys(bytes(32, 10));
    expect(await code(openBody(other.dataKey, 'run', 'r1', body))).toBe('auth');
  });

  it('a body is not a blob and a blob is not a body', async () => {
    const { dataKey } = await keys();
    const body = await sealBody(dataKey, 'run', 'r1', bytes(1), { segmentSize: 1 });
    // From byte 4 on it is laid out as a blob: 0x01 | nonce | ciphertext | tag.
    expect(body[4]).toBe(1);
    expect(await code(open(dataKey, 'run', 'r1', body.slice(4)))).toBe('auth');
    const blob = await seal(dataKey, 'run', 'r1', bytes(3));
    expect(['auth', 'malformed']).toContain(await code(openBody(dataKey, 'run', 'r1', blob)));
  });

  it('an empty final segment after others is refused even when it is authentic', async () => {
    const { dataKey } = await keys();
    const n0 = random(NONCE_BYTES);
    const n1 = random(NONCE_BYTES);
    const forged = concat(
      Uint8Array.of(1),
      u32(S),
      n0,
      await gcmEncrypt(dataKey, n0, segmentAad('run', 'r1', S, 0, false), bytes(S)),
      n1,
      await gcmEncrypt(dataKey, n1, segmentAad('run', 'r1', S, 1, true), new Uint8Array(0)),
    );
    expect(await code(openBody(dataKey, 'run', 'r1', forged))).toBe('malformed');
  });

  it('a streaming reader gets the whole segments before the cut and then the error', async () => {
    const { dataKey } = await keys();
    const plain = bytes(3 * S + 3);
    const body = await sealBody(dataKey, 'run', 'r1', plain, o);
    const got: Uint8Array[] = [];
    let failed = '';
    try {
      for await (const c of decryptBody(dataKey, 'run', 'r1', [body.slice(0, 5 + 2 * FRAME + 30)])) got.push(c);
    } catch (e) {
      failed = (e as CloudCryptoError).code;
    }
    expect(failed).toBe('auth');
    expect(concat(...got)).toEqual(plain.slice(0, 2 * S));
    const reader = decryptBodyStream(dataKey, 'run', 'r1', streamOf(body.slice(0, 5 + FRAME), 11)).getReader();
    await expect(reader.read()).rejects.toMatchObject({ code: 'auth' });
  });

  it('works a segment at a time: it never reads far ahead of what it has written', async () => {
    const { dataKey } = await keys();
    const size = 1024;
    const chunk = 100;
    let pulled = 0;
    const source = (async function* () {
      for (let i = 0; i < 200; i++) {
        pulled += chunk;
        yield bytes(chunk, i);
      }
    })();
    let written = 0;
    let segments = 0;
    for await (const c of encryptBody(dataKey, 'run', 'r1', source, { segmentSize: size })) {
      if (segments++ > 0) written += c.length - 28;
      expect(pulled - written).toBeLessThanOrEqual(size + chunk);
    }
    expect(written).toBe(200 * chunk);

    // The reader too: the plaintext handed out trails the bytes taken in by at most a frame and a chunk.
    const body = await sealBody(dataKey, 'run', 'r1', bytes(20_000), { segmentSize: size });
    let taken = 0;
    const sealedSource = (function* () {
      for (let at = 0; at < body.length; at += chunk) {
        taken += Math.min(chunk, body.length - at);
        yield body.subarray(at, at + chunk);
      }
    })();
    let out = 0;
    for await (const c of decryptBody(dataKey, 'run', 'r1', sealedSource)) {
      out += c.length;
      expect(taken - out).toBeLessThanOrEqual(2 * (size + 28) + chunk + 5);
    }
    expect(out).toBe(20_000);
  });

  it('a source may reuse its buffer between chunks', async () => {
    const { dataKey } = await keys();
    const plain = bytes(5 * S + 3);
    const shared = new Uint8Array(3);
    const source = (function* () {
      for (let at = 0; at < plain.length; at += 3) {
        const piece = plain.subarray(at, at + 3);
        shared.fill(0xee);
        shared.set(piece);
        yield shared.subarray(0, piece.length);
      }
    })();
    const body = await drain(encryptBody(dataKey, 'run', 'r1', source, o));
    expect(await openBody(dataKey, 'run', 'r1', body)).toEqual(plain);
  });

  it('refuses a segment size out of range and a kind or id it cannot encode, before writing', async () => {
    const { dataKey } = await keys();
    for (const size of [0, -1, 1.5, 2 ** 24 + 1, Number.NaN]) expect(await code(sealBody(dataKey, 'run', 'r1', bytes(3), { segmentSize: size }))).toBe('bad_input');
    expect(await code(sealBody(dataKey, 'run', '\ud800', bytes(3), o))).toBe('bad_input');
    expect(await code(openBody(dataKey, 'x'.repeat(70000), 'r1', bytes(40)))).toBe('bad_input');
  });

  it('every segment gets its own nonce', async () => {
    const { dataKey } = await keys();
    const { segments } = parts(await sealBody(dataKey, 'run', 'r1', utf8('x'.repeat(10 * S)), o));
    const nonces = new Set(segments.map((s) => Buffer.from(s.slice(0, 12)).toString('hex')));
    expect(nonces.size).toBe(segments.length);
  });
});
