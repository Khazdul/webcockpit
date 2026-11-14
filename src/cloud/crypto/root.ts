// The root key (stage 60, "Root key"): 32 random bytes made at
// registration. The server keeps two wrapped copies of it, one under the
// password's kek and one under the recovery code's. Opened, it gives
//
//   dataKey = HKDF-SHA-256(root, salt = empty, info = "wc-data")  AES-256-GCM, non-extractable
//   idKey   = HKDF-SHA-256(root, salt = empty, info = "wc-id")    HMAC-SHA-256, non-extractable, sign only
//
// and its bytes are wiped. (A non-extractable AES key cannot be the input
// of a derivation, hence a root that both keys come from.)
//
// A wrap is a blob (blob.ts) of kind "wrap-pw" or "wrap-rc" whose id is
// the lowercased account name: the two wraps cannot be swapped, and one
// account's wrap is not another's.

import { type Bytes, type RandomSource, accountLabel, systemRandom } from './bytes';
import { BLOB_OVERHEAD, open, seal } from './blob';
import { CloudCryptoError } from './errors';
import { hkdfAesKey, hkdfHmacKey } from './kdf';

export const ROOT_BYTES = 32;
export const WRAP_BYTES = ROOT_BYTES + BLOB_OVERHEAD;

/** Which wrap: under the password's kek or the recovery code's. */
export type WrapKind = 'wrap-pw' | 'wrap-rc';

/** What an unlocked account works with. Both are non-extractable. */
export interface AccountKeys {
  /** AES-256-GCM: items (blob.ts) and run bodies (segments.ts). */
  dataKey: CryptoKey;
  /** HMAC-SHA-256: opaque ids (ids.ts). */
  idKey: CryptoKey;
}

function checkWrapKind(which: WrapKind): void {
  if (which !== 'wrap-pw' && which !== 'wrap-rc') throw new CloudCryptoError('bad_input', 'not a wrap kind');
}

/** A new root. The caller wipes it (`fill(0)`) when done. */
export function makeRoot(random: RandomSource = systemRandom): Bytes {
  return random(ROOT_BYTES);
}

/** Wraps the root under `kek` for account `name`: a 61-byte blob. */
export async function wrapRoot(root: Bytes, kek: CryptoKey, which: WrapKind, name: string, random: RandomSource = systemRandom): Promise<Bytes> {
  checkWrapKind(which);
  if (root.length !== ROOT_BYTES) throw new CloudCryptoError('bad_input', 'a root is 32 bytes');
  return seal(kek, which, accountLabel(name), root, random);
}

/**
 * Opens a wrap: the root's bytes, which the caller wipes (`fill(0)`).
 * `auth` when `kek` is not the wrap's key (a wrong password or code), or
 * the wrap is the other kind or another account's; `malformed` and
 * `unknown_version` as for any blob. Prefer `openRoot`.
 */
export async function unwrapRoot(blob: Bytes, kek: CryptoKey, which: WrapKind, name: string): Promise<Bytes> {
  checkWrapKind(which);
  const root = await open(kek, which, accountLabel(name), blob);
  if (root.length !== ROOT_BYTES) {
    root.fill(0);
    throw new CloudCryptoError('malformed', 'a wrap that does not hold a root');
  }
  return root;
}

/** Root → the data key and the id key. Does not wipe the root. */
export async function deriveKeys(root: Bytes): Promise<AccountKeys> {
  if (root.length !== ROOT_BYTES) throw new CloudCryptoError('bad_input', 'a root is 32 bytes');
  const [dataKey, idKey] = await Promise.all([hkdfAesKey(root, 'wc-data'), hkdfHmacKey(root, 'wc-id')]);
  return { dataKey, idKey };
}

/** Unwrap → derive → wipe in one call, so no caller holds the root. */
export async function openRoot(blob: Bytes, kek: CryptoKey, which: WrapKind, name: string): Promise<AccountKeys> {
  const root = await unwrapRoot(blob, kek, which, name);
  try {
    return await deriveKeys(root);
  } finally {
    root.fill(0);
  }
}
