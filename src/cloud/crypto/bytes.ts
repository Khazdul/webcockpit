// Byte helpers of the account crypto: UTF-8, joining, the length-prefixed
// field encoding every associated-data and HMAC input uses, the account
// name as it is bound into keys, and the source of randomness (injected
// in tests).

import { CloudCryptoError } from './errors';

/** Bytes over a plain `ArrayBuffer` (what `crypto.subtle` takes). */
export type Bytes = Uint8Array<ArrayBuffer>;

/** `n` random bytes. The default is `crypto.getRandomValues`; tests pass fixed bytes. */
export type RandomSource = (n: number) => Bytes;

export const systemRandom: RandomSource = (n) => crypto.getRandomValues(new Uint8Array(n));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text: string): Bytes {
  return encoder.encode(text) as Bytes;
}

export function concat(...parts: Uint8Array[]): Bytes {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A 32-bit unsigned integer, big-endian. */
export function u32(n: number): Bytes {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new CloudCryptoError('bad_input', 'not a 32-bit unsigned integer');
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

/**
 * One text field: its UTF-8 length as 16 bits big-endian, then the UTF-8
 * bytes. Fields put one after another are unambiguous: no two different
 * lists of fields give the same bytes. Refuses a field over 65 535 bytes
 * and a string that is not well-formed UTF-16 (a lone surrogate would be
 * encoded as U+FFFD and collide with another string).
 */
export function field(text: string): Bytes {
  const body = utf8(text);
  if (body.length > 0xffff) throw new CloudCryptoError('bad_input', 'a kind or id is longer than 65535 bytes');
  if (decoder.decode(body) !== text) throw new CloudCryptoError('bad_input', 'a kind or id is not well-formed text');
  const out = new Uint8Array(2 + body.length);
  out[0] = body.length >> 8;
  out[1] = body.length & 0xff;
  out.set(body, 2);
  return out;
}

/** `kind | id` as two fields: the encoding in every associated data and opaque id. */
export function kindId(kind: string, id: string): Bytes {
  return concat(field(kind), field(id));
}

/**
 * The account name as it is bound into derivations and wraps: lowercased.
 * Refuses anything that is not a user name of ADR 0145 (3–20 of
 * `a-z 0-9 _ -`), so no two spellings of one account can give two keys.
 */
export function accountLabel(name: string): string {
  const label = typeof name === 'string' ? name.toLowerCase() : '';
  if (!/^[a-z0-9_-]{3,20}$/.test(label)) throw new CloudCryptoError('bad_input', 'not an account name');
  return label;
}
