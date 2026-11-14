// The blob format of spec §7.3: every synced item and both wraps of the
// root key.
//
//   blob = version (1 byte, 0x01) | nonce (12 random bytes) | AES-256-GCM ciphertext | tag (16)
//   associated data = version (0x01) | 0x42 ("B") | field(kind) | field(id)
//   field(x) = length of UTF-8(x) as 16 bits big-endian | UTF-8(x)
//
// The kind and the id are in the associated data, so the server cannot
// hand out one item's blob as another's. The length prefixes make the
// encoding unambiguous ("ab" | "c" is not "a" | "bc"); the "B" keeps a
// blob's associated data apart from a body segment's (segments.ts).
//
// Nonces are random, 96 bits, one per blob. With random nonces under one
// key, NIST SP 800-38D asks for at most 2^32 encryptions for a collision
// chance under 2^-32; an account that writes an item every second gets
// there in 136 years. Body segments share the key and the count.

import { type Bytes, type RandomSource, concat, kindId, systemRandom } from './bytes';
import { CloudCryptoError } from './errors';

export const BLOB_VERSION = 1;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
/** A blob is this much longer than its plaintext. */
export const BLOB_OVERHEAD = 1 + NONCE_BYTES + TAG_BYTES;

/** A blob's associated data. */
export function blobAad(kind: string, id: string): Bytes {
  return concat(Uint8Array.of(BLOB_VERSION, 0x42), kindId(kind, id));
}

/** AES-256-GCM with a 128-bit tag: ciphertext | tag. */
export async function gcmEncrypt(key: CryptoKey, nonce: Bytes, aad: Bytes, plaintext: Bytes): Promise<Bytes> {
  if (nonce.length !== NONCE_BYTES) throw new CloudCryptoError('bad_input', 'a nonce is 12 bytes');
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, plaintext));
}

/** The reverse; `auth` when the tag does not hold. */
export async function gcmDecrypt(key: CryptoKey, nonce: Bytes, aad: Bytes, sealed: Bytes): Promise<Bytes> {
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, sealed);
  } catch {
    throw new CloudCryptoError('auth', 'the blob does not open: wrong key, kind or id, or changed bytes');
  }
  return new Uint8Array(plain);
}

/** Encrypts `plaintext` as the blob of item `kind`/`id`. */
export async function seal(key: CryptoKey, kind: string, id: string, plaintext: Bytes, random: RandomSource = systemRandom): Promise<Bytes> {
  const aad = blobAad(kind, id);
  const nonce = random(NONCE_BYTES);
  return concat(Uint8Array.of(BLOB_VERSION), nonce, await gcmEncrypt(key, nonce, aad, plaintext));
}

/**
 * Opens the blob of item `kind`/`id`. Throws a `CloudCryptoError`:
 * `unknown_version` (a newer client wrote it: keep the item untouched and
 * ask for an update), `malformed` (empty or too short), `auth` (the wrong
 * key, kind or id, or changed bytes).
 */
export async function open(key: CryptoKey, kind: string, id: string, blob: Bytes): Promise<Bytes> {
  if (!(blob instanceof Uint8Array) || blob.length === 0) throw new CloudCryptoError('malformed', 'an empty blob');
  // The version first: a later format need not be as long as this one.
  if (blob[0] !== BLOB_VERSION) throw new CloudCryptoError('unknown_version', `blob version ${blob[0]}`);
  if (blob.length < BLOB_OVERHEAD) throw new CloudCryptoError('malformed', 'a blob shorter than its nonce and tag');
  return gcmDecrypt(key, blob.slice(1, 1 + NONCE_BYTES), blobAad(kind, id), blob.slice(1 + NONCE_BYTES));
}
