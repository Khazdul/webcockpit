// The account's key flows (stage 60): what each request of the account
// API needs, made from the pieces of this directory. Binary values come
// and go as base64url, as on the wire. No function here returns the root
// key or keeps it: it is made or unwrapped, used and wiped inside.
//
// Every flow takes the account name: it is bound, lowercased, into both
// wraps and the recovery code's keys (root.ts, recovery.ts).
//
// The password's slow step runs through `opts.derive`, by default the KDF
// worker (kdf-client.ts).

import { type Bytes, type RandomSource, accountLabel, systemRandom } from './bytes';
import { fromBase64Url, toBase64Url } from './base64url';
import { CloudCryptoError, isCryptoError } from './errors';
import { DEFAULT_KDF, type KdfParams, SALT_BYTES } from './kdf';
import { type PasswordKdf, derivePasswordKeys } from './kdf-client';
import { deriveRecoveryKeys, makeRecoveryCode } from './recovery';
import { type AccountKeys, type WrapKind, deriveKeys, makeRoot, unwrapRoot, wrapRoot } from './root';

export interface FlowOptions {
  /** The password KDF (default: the worker). */
  derive?: PasswordKdf;
  /** The parameters a new password gets (default `DEFAULT_KDF`). */
  kdf?: KdfParams;
  random?: RandomSource;
  /** Cancels the KDF: the flow rejects with `cancelled`. */
  signal?: AbortSignal;
}

/** The key fields of `POST /api/auth/register` (the page adds name, label and turnstile). */
export interface RegisterKeys {
  salt: string;
  kdf: KdfParams;
  authKey: string;
  recoveryAuth: string;
  wrapPw: string;
  wrapRc: string;
}

/** The `set` of a new password (`/api/auth/recover`, `/api/u/account/password`). */
export interface PasswordSet {
  salt: string;
  kdf: KdfParams;
  authKey: string;
  wrapPw: string;
}

/** `GET /api/auth/params`'s answer. */
export interface LoginParams {
  salt: string;
  kdf: KdfParams;
}

async function unwrapAs(blob: string, kek: CryptoKey, which: WrapKind, name: string): Promise<Bytes> {
  try {
    return await unwrapRoot(fromBase64Url(blob), kek, which, name);
  } catch (e) {
    // The key did not fit: the password (or the code) was wrong. A malformed
    // wrap or one of an unknown version stays what it is.
    if (isCryptoError(e, 'auth')) throw new CloudCryptoError(which === 'wrap-pw' ? 'wrong_password' : 'wrong_code');
    throw e;
  }
}

/** A new salt, the password's keys under it, and the root wrapped for the password. */
async function setPassword(root: Bytes, name: string, password: string, opts: FlowOptions): Promise<PasswordSet> {
  const random = opts.random ?? systemRandom;
  const kdf = opts.kdf ?? DEFAULT_KDF;
  const salt = random(SALT_BYTES);
  const { authKey, kek } = await (opts.derive ?? derivePasswordKeys)(name, password, salt, kdf, { signal: opts.signal });
  const wrapPw = await wrapRoot(root, kek, 'wrap-pw', name, random);
  return { salt: toBase64Url(salt), kdf, authKey: toBase64Url(authKey), wrapPw: toBase64Url(wrapPw) };
}

/** A new code, its keys, and the root wrapped for it. */
async function setRecovery(root: Bytes, name: string, random: RandomSource): Promise<{ recoveryCode: string; recoveryAuth: string; wrapRc: string }> {
  const recoveryCode = makeRecoveryCode(random);
  const { recoveryAuth, recoveryKek } = await deriveRecoveryKeys(recoveryCode, name);
  const wrapRc = await wrapRoot(root, recoveryKek, 'wrap-rc', name, random);
  return { recoveryCode, recoveryAuth: toBase64Url(recoveryAuth), wrapRc: toBase64Url(wrapRc) };
}

/**
 * Registration: makes the salt, the root and the recovery code and
 * returns the request's key fields, the code to show once, and the
 * account's keys. Random draws, in order: root (32), salt (16), the
 * password wrap's nonce (12), the code (15), the recovery wrap's nonce (12).
 */
export async function prepareRegistration(
  name: string,
  password: string,
  opts: FlowOptions = {},
): Promise<{ request: RegisterKeys; recoveryCode: string; keys: AccountKeys }> {
  accountLabel(name); // a bad name fails here, not after the KDF
  const random = opts.random ?? systemRandom;
  const root = makeRoot(random);
  try {
    const pw = await setPassword(root, name, password, opts);
    const rc = await setRecovery(root, name, random);
    const keys = await deriveKeys(root);
    return {
      request: { salt: pw.salt, kdf: pw.kdf, authKey: pw.authKey, recoveryAuth: rc.recoveryAuth, wrapPw: pw.wrapPw, wrapRc: rc.wrapRc },
      recoveryCode: rc.recoveryCode,
      keys,
    };
  } finally {
    root.fill(0);
  }
}

/**
 * Login, first half: name, password and the server's parameters → the
 * `authKey` to send and the `kek` to open the answer's `wrapPw` with.
 * Rejects with `bad_kdf` when the parameters are not acceptable,
 * `malformed` when the salt is not base64url, `bad_input` when the name is
 * not an account name.
 */
export async function derivePasswordLogin(
  name: string,
  password: string,
  params: LoginParams,
  opts: FlowOptions = {},
): Promise<{ authKey: string; kek: CryptoKey }> {
  accountLabel(name);
  const { authKey, kek } = await (opts.derive ?? derivePasswordKeys)(name, password, fromBase64Url(params.salt), params.kdf, { signal: opts.signal });
  return { authKey: toBase64Url(authKey), kek };
}

/**
 * Login, second half: the password's `kek` and the server's `wrapPw` → the
 * account's keys. `wrong_password` when the kek does not open the wrap;
 * `malformed` or `unknown_version` when the wrap is not one this client
 * reads. When the server has just accepted the `authKey` of the same
 * password, `wrong_password` here means a corrupt or foreign wrap, not a
 * typing mistake, and the page should say so.
 */
export async function unlockWithPassword(name: string, kek: CryptoKey, wrapPw: string): Promise<AccountKeys> {
  const root = await unwrapAs(wrapPw, kek, 'wrap-pw', name);
  try {
    return await deriveKeys(root);
  } finally {
    root.fill(0);
  }
}

/**
 * Change password: opens `wrapPw` with the old password's kek (from
 * `derivePasswordLogin`; `wrong_password` when it does not fit) and wraps
 * the root for the new password under a new salt. No data is re-encrypted
 * and the account's keys stay the same.
 */
export async function changePassword(name: string, oldKek: CryptoKey, wrapPw: string, newPassword: string, opts: FlowOptions = {}): Promise<{ set: PasswordSet }> {
  const root = await unwrapAs(wrapPw, oldKek, 'wrap-pw', name);
  try {
    return { set: await setPassword(root, name, newPassword, opts) };
  } finally {
    root.fill(0);
  }
}

/**
 * A new recovery code: opens `wrapPw` with the password's kek
 * (`wrong_password` when it does not fit) and wraps the root for a new
 * code. The old code stops working when the server takes the answer.
 */
export async function newRecoveryCode(
  name: string,
  kek: CryptoKey,
  wrapPw: string,
  opts: Pick<FlowOptions, 'random'> = {},
): Promise<{ recoveryCode: string; recoveryAuth: string; wrapRc: string }> {
  const root = await unwrapAs(wrapPw, kek, 'wrap-pw', name);
  try {
    return await setRecovery(root, name, opts.random ?? systemRandom);
  } finally {
    root.fill(0);
  }
}

/**
 * Recovery, first half: the code as typed → the `recoveryAuth` to send and
 * the key for the answer's `wrapRc`. `bad_input` when it is not a code
 * (check with `parseRecoveryCode` as the player types).
 */
export async function deriveRecoveryLogin(name: string, code: string): Promise<{ recoveryAuth: string; recoveryKek: CryptoKey }> {
  const { recoveryAuth, recoveryKek } = await deriveRecoveryKeys(code, name);
  return { recoveryAuth: toBase64Url(recoveryAuth), recoveryKek };
}

/**
 * Recovery, second half: opens `wrapRc` (`wrong_code` when the code's key
 * does not fit) and sets a new password: the `set` to send and the
 * account's keys. The recovery code stays valid.
 */
export async function recoverAccount(
  name: string,
  recoveryKek: CryptoKey,
  wrapRc: string,
  newPassword: string,
  opts: FlowOptions = {},
): Promise<{ set: PasswordSet; keys: AccountKeys }> {
  const root = await unwrapAs(wrapRc, recoveryKek, 'wrap-rc', name);
  try {
    const set = await setPassword(root, name, newPassword, opts);
    return { set, keys: await deriveKeys(root) };
  } finally {
    root.fill(0);
  }
}
