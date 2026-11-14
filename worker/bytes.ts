// Bytes, base64url and the hashes of the account endpoints (ADR 0145):
// WebCrypto only, the same under workerd and under Node (the static
// server).

type Bytes = Uint8Array<ArrayBuffer>;

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Base64url without padding. */
export function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The bytes of a base64url string without padding, or null when it is not
 * exactly that: another character, padding, an impossible length, or
 * spare bits that are not zero (so one value has one spelling).
 */
export function fromB64url(s: string): Bytes | null {
  if (!B64URL.test(s) || s.length % 4 === 1) return null;
  let bin: string;
  try {
    bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return toB64url(out) === s ? out : null;
}

export function utf8(s: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(s));
}

export function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function sha256(bytes: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** HMAC-SHA-256 of a text under a key of bytes. */
export async function hmac(key: Bytes, text: string): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8(text)));
}

/** Equality of two strings in time that depends on their lengths only. */
export function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
