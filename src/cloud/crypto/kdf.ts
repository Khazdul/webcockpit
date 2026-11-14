// Password → keys (ADR 0145 "Keys"; "As built (stage 60, crypto)").
//
//   master  = PBKDF2-HMAC-SHA-256(UTF-8(NFKC(password)), salt | field(lowercased name), rounds, 256 bit)
//   authKey = HKDF-SHA-256(master, salt = empty, info = "wc-auth", 32 bytes)   sent to the server
//   kek     = HKDF-SHA-256(master, salt = empty, info = "wc-kek", 32 bytes)    AES-256-GCM, non-extractable
//
// `salt` is the server's 16 bytes. The account name follows it (bytes.ts's
// `field`), so the PBKDF2 salt is the account's own whatever the server
// answers: a hostile server that hands every account one salt still cannot
// test one guess against all of them.
//
// The password is normalised with NFKC, so the same password typed as
// composed or decomposed characters (a phone's and a desktop's keyboards
// differ) gives the same key. Nothing else is done to it: no trimming, no
// case folding.
//
// The slow step runs in a Web Worker in the app (kdf-client.ts); this file
// is what the worker and the unit tests run.

import { type Bytes, accountLabel, concat, field, utf8 } from './bytes';
import { CloudCryptoError } from './errors';

export const KDF_NAME = 'pbkdf2-sha256';
/** OWASP's figure for PBKDF2-HMAC-SHA-256 and the least this client accepts. */
export const MIN_ROUNDS = 600_000;
/** The most this client accepts: a hostile answer cannot hang the device for minutes. */
export const MAX_ROUNDS = 10_000_000;
export const SALT_BYTES = 16;
export const KEY_BYTES = 32;

export interface KdfParams {
  name: typeof KDF_NAME;
  rounds: number;
}

/** What a new account and a new password get. */
export const DEFAULT_KDF: KdfParams = { name: KDF_NAME, rounds: MIN_ROUNDS };

/** The password's key pair: `authKey` goes to the server, `kek` opens the password wrap. */
export interface PasswordKeys {
  authKey: Bytes;
  kek: CryptoKey;
}

/**
 * The server's KDF parameters and salt, checked: a known name, whole
 * rounds within [MIN_ROUNDS, MAX_ROUNDS], a 16-byte salt. Throws
 * `bad_kdf` otherwise (a hostile server must not get a 1-round key).
 */
export function checkKdf(kdf: unknown, salt: unknown): KdfParams {
  const k = kdf as { name?: unknown; rounds?: unknown } | null;
  if (!k || typeof k !== 'object' || k.name !== KDF_NAME) throw new CloudCryptoError('bad_kdf', 'unknown KDF');
  const rounds = k.rounds;
  if (typeof rounds !== 'number' || !Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    throw new CloudCryptoError('bad_kdf', 'KDF rounds out of range');
  }
  if (!(salt instanceof Uint8Array) || salt.length !== SALT_BYTES) throw new CloudCryptoError('bad_kdf', 'bad salt');
  return { name: KDF_NAME, rounds };
}

/** The bytes of a password that are hashed: UTF-8 of its NFKC form. */
export function passwordBytes(password: string): Bytes {
  return utf8(password.normalize('NFKC'));
}

/** The salt PBKDF2 gets: the server's salt, then the lowercased account name as a field. */
export function pbkdf2Salt(name: string, salt: Uint8Array): Bytes {
  return concat(salt, field(accountLabel(name)));
}

/** PBKDF2-HMAC-SHA-256. No bounds: `checkKdf` is the caller's. */
export async function pbkdf2(password: Bytes, salt: Bytes, rounds: number, bytes = KEY_BYTES): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, bytes * 8);
  return new Uint8Array(bits);
}

const hkdfParams = (salt: Bytes, info: string): HkdfParams => ({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) });

function hkdfKey(ikm: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

const NO_SALT: Bytes = new Uint8Array(0);

/** HKDF-SHA-256 (RFC 5869) to bytes, `info` as bytes (the RFC's vectors). */
export async function hkdf(ikm: Bytes, salt: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await hkdfKey(ikm), bytes * 8);
  return new Uint8Array(bits);
}

/** HKDF-SHA-256 to 32 bytes that are meant to leave the browser (`authKey`, `recoveryAuth`). */
export async function hkdfAuth(ikm: Bytes, info: string, salt: Bytes = NO_SALT): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.deriveBits(hkdfParams(salt, info), await hkdfKey(ikm), KEY_BYTES * 8));
}

/** HKDF-SHA-256 to a non-extractable AES-256-GCM key (its bytes never exist in script). */
export async function hkdfAesKey(ikm: Bytes, info: string, salt: Bytes = NO_SALT): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(hkdfParams(salt, info), await hkdfKey(ikm), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** HKDF-SHA-256 to a non-extractable HMAC-SHA-256 key (256 bit, sign only). */
export async function hkdfHmacKey(ikm: Bytes, info: string, salt: Bytes = NO_SALT): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(hkdfParams(salt, info), await hkdfKey(ikm), { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
}

/**
 * Name and password → `authKey` and `kek`, with no check of the rounds or the salt:
 * for the test vectors (reduced rounds). The app goes through
 * `derivePasswordKeysChecked` (kdf-client.ts, kdf.worker.ts).
 * The master's bytes are wiped before this returns.
 */
export async function derivePasswordKeysUnchecked(name: string, password: string, salt: Bytes, rounds: number): Promise<PasswordKeys> {
  const fullSalt = pbkdf2Salt(name, salt);
  const pw = passwordBytes(password);
  let master: Bytes | null = null;
  try {
    master = await pbkdf2(pw, fullSalt, rounds);
    const [authKey, kek] = await Promise.all([hkdfAuth(master, 'wc-auth'), hkdfAesKey(master, 'wc-kek')]);
    return { authKey, kek };
  } finally {
    pw.fill(0);
    master?.fill(0);
  }
}

/** Name and password → `authKey` and `kek` on the calling thread, parameters checked (`bad_kdf`, `bad_input`). */
export async function derivePasswordKeysChecked(name: string, password: string, salt: Bytes, kdf: unknown): Promise<PasswordKeys> {
  const { rounds } = checkKdf(kdf, salt);
  return derivePasswordKeysUnchecked(name, password, salt, rounds);
}
