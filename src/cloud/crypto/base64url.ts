// base64url without padding (RFC 4648 §5): how every binary value of the
// account API travels (stage 60, "Wire format").

import type { Bytes } from './bytes';
import { CloudCryptoError } from './errors';

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  // In pieces: a spread of a large array overflows the argument list.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Strict: only the base64url alphabet, no padding, no impossible length and
 * no stray bits in the last character (one value has one spelling).
 * Throws `malformed` otherwise.
 */
export function fromBase64Url(text: string): Bytes {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new CloudCryptoError('malformed', 'not base64url');
  }
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (toBase64Url(out) !== text) throw new CloudCryptoError('malformed', 'not canonical base64url');
  return out;
}
