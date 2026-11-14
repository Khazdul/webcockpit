// Opaque ids (spec §7.3): where an item's local key holds a name (a
// profile's name, a run's `Character/time`), the server gets
//
//   id = base64url(first 16 bytes of HMAC-SHA-256(idKey, field(kind) | field(localKey)))
//
// 22 characters. `field` is the length-prefixed encoding of bytes.ts, so
// kind "a" with key "bc" is not kind "ab" with key "c". The same kind and
// key give the same id on every device of the account, and nothing about
// the name can be read from it.

import { kindId } from './bytes';
import { toBase64Url } from './base64url';

export const OPAQUE_ID_BYTES = 16;

export async function opaqueId(idKey: CryptoKey, kind: string, localKey: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', idKey, kindId(kind, localKey)));
  return toBase64Url(mac.subarray(0, OPAQUE_ID_BYTES));
}
