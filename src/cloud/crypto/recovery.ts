// The recovery code (ADR 0145): 120 random bits as 24 characters, shown
// in six groups of four, e.g. `7K2M-9QXA-0D4H-VT3P-B6RW-1ZCE`.
//
// Alphabet: Crockford's base32, `0123456789ABCDEFGHJKMNPQRSTVWXYZ`: the
// digits and the letters without I, L, O and U. So what looks like a zero
// is a zero and what looks like a one is a one, and the parser can take
// O for 0 and I or L for 1. Each character carries exactly 5 bits of the
// 15 random bytes, most significant bit first, so there is no modulo and
// no bias: the 2^120 byte strings and the codes map one to one.
//
//   recoveryAuth = HKDF-SHA-256(the code's 15 bytes, salt = UTF-8(lowercased name), info = "wc-recovery-auth")
//   recoveryKek  = HKDF-SHA-256(the code's 15 bytes, salt = UTF-8(lowercased name), info = "wc-recovery-kek")
//
// The account name is the HKDF salt: one code never gives the same keys
// for two accounts.

import { type Bytes, type RandomSource, accountLabel, systemRandom, utf8 } from './bytes';
import { CloudCryptoError } from './errors';
import { hkdfAesKey, hkdfAuth } from './kdf';

export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_BYTES = 15;
export const RECOVERY_CHARS = 24;

/** The recovery code's key pair: `recoveryAuth` goes to the server, `recoveryKek` opens the recovery wrap. */
export interface RecoveryKeys {
  recoveryAuth: Bytes;
  recoveryKek: CryptoKey;
}

const grouped = (chars: string): string => (chars.match(/.{4}/g) ?? []).join('-');

/**
 * Typed characters as code characters: upper case, no spaces, hyphens,
 * dashes, dots or underscores, O read as 0 and I or L as 1. Null when a
 * character is left that no code has (U, punctuation, other scripts).
 */
function codeChars(input: string): string | null {
  if (typeof input !== 'string') return null;
  const chars = input
    .toUpperCase()
    .replace(/[\s\-‐-―−_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  for (const c of chars) if (!RECOVERY_ALPHABET.includes(c)) return null;
  return chars;
}

/** 15 bytes → the code in its canonical form (upper case, six hyphenated groups). */
export function encodeRecoveryCode(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_BYTES) throw new CloudCryptoError('bad_input', 'a recovery code is 15 bytes');
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += RECOVERY_ALPHABET[(acc >> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  return grouped(out);
}

/** A new code from 15 random bytes. */
export function makeRecoveryCode(random: RandomSource = systemRandom): string {
  const bytes = random(RECOVERY_BYTES);
  try {
    return encodeRecoveryCode(bytes);
  } finally {
    bytes.fill(0);
  }
}

/**
 * What a player typed or pasted → the canonical code, or null. Tolerant of
 * case, spaces, hyphens and dashes of any kind, and of O for 0 and I or L
 * for 1. (U is in no code and is not guessed at.)
 */
export function parseRecoveryCode(input: string): string | null {
  const chars = codeChars(input);
  return chars !== null && chars.length === RECOVERY_CHARS ? grouped(chars) : null;
}

/** The code's last group of four ("type the last group to confirm you kept it"). */
export function lastGroup(code: string): string {
  const canonical = parseRecoveryCode(code);
  if (!canonical) throw new CloudCryptoError('bad_input', 'not a recovery code');
  return canonical.slice(-4);
}

/** True when `typed` is the last group of `code`, read as tolerantly as the parser reads. */
export function lastGroupMatches(code: string, typed: string): boolean {
  const canonical = parseRecoveryCode(code);
  return canonical !== null && codeChars(typed) === canonical.slice(-4);
}

/** A canonical or typed code → its 15 bytes. Throws `bad_input` when it is not a code. */
export function recoveryCodeBytes(code: string): Bytes {
  const canonical = parseRecoveryCode(code);
  if (!canonical) throw new CloudCryptoError('bad_input', 'not a recovery code');
  const out = new Uint8Array(RECOVERY_BYTES);
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (const c of canonical) {
    if (c === '-') continue;
    acc = (acc << 5) | RECOVERY_ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/** Code and account name → `recoveryAuth` and `recoveryKek`. */
export async function deriveRecoveryKeys(code: string, name: string): Promise<RecoveryKeys> {
  const salt = utf8(accountLabel(name));
  const ikm = recoveryCodeBytes(code);
  try {
    const [recoveryAuth, recoveryKek] = await Promise.all([hkdfAuth(ikm, 'wc-recovery-auth', salt), hkdfAesKey(ikm, 'wc-recovery-kek', salt)]);
    return { recoveryAuth, recoveryKek };
  } finally {
    ikm.fill(0);
  }
}
