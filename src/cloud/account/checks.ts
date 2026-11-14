// What the account pages check before anything is sent (spec §7.2). Pure:
// no request, no storage. The server and the crypto module check again;
// these exist so the page can say what is wrong while the player types.
//
// The only crypto this file touches is the recovery code's parser
// (src/cloud/crypto/recovery.ts: small, no worker), so that the page and
// the derivation read a typed code in exactly one way.

import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, NAME_PATTERN } from '../../../shared/cloud/api.ts';
import { parseRecoveryCode } from '../crypto/recovery';

export { cleanLabel, deviceLabel } from '../device-info';

// --- User name ---

export type NameProblem = 'empty' | 'too_short' | 'too_long' | 'bad_characters';

/**
 * A user name as typed: null when it can be one (3–20 of `A-Z a-z 0-9 _
 * -`), else what is wrong, the first that applies. Surrounding spaces are
 * not forgiven: the page trims before it asks, if it wants to.
 */
export function checkName(name: string): NameProblem | null {
  if (name.length === 0) return 'empty';
  if (!/^[A-Za-z0-9_-]*$/.test(name)) return 'bad_characters';
  if (name.length < NAME_MIN_LENGTH) return 'too_short';
  if (name.length > NAME_MAX_LENGTH) return 'too_long';
  return NAME_PATTERN.test(name) ? null : 'bad_characters';
}

// --- Password ---

/** The fewest characters of a password (spec §7.2), counted after NFKC, as code points. */
export const PASSWORD_MIN_LENGTH = 10;

/** The password as the crypto module will read it (src/cloud/crypto/kdf.ts normalises with NFKC). */
const normal = (password: string): string => password.normalize('NFKC');

/** The length that counts: code points after NFKC. */
export function passwordLength(password: string): number {
  return [...normal(password)].length;
}

export type PasswordProblem = 'empty' | 'too_short';

/** Null when the password may be used for an account, else what is wrong. */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length === 0) return 'empty';
  return passwordLength(password) < PASSWORD_MIN_LENGTH ? 'too_short' : null;
}

/** True when the password and its repeat are the same after NFKC (what the key is made from). */
export function passwordsMatch(password: string, again: string): boolean {
  return normal(password) === normal(again);
}

export type PasswordStrength = 'too_short' | 'weak' | 'fair' | 'good' | 'strong';

const CLASSES = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{Ll}\p{Lu}\p{Nd}]/u];

/**
 * A hint, not a verdict. It knows length and variety and nothing else: no
 * dictionary, no list of leaked passwords, so "correcthorse" scores as
 * any twelve letters would. The rule, on the password after NFKC:
 *
 *   too_short  under `PASSWORD_MIN_LENGTH` characters
 *   weak       fewer than 6 different characters, or it contains the user
 *              name (when one of 3+ characters is given), whatever else
 *   otherwise a point for 14 characters or more, a second for 20 or more,
 *   and one for three or more kinds of character (lower case, upper case,
 *   digits, anything else):
 *              0 points weak, 1 fair, 2 good, 3 strong
 *
 * So length alone reaches "good" (a passphrase), and a ten-character
 * password is "fair" at best.
 */
export function passwordStrength(password: string, name = ''): PasswordStrength {
  const text = normal(password);
  const chars = [...text];
  if (chars.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (new Set(chars).size < 6) return 'weak';
  if (name.length >= NAME_MIN_LENGTH && text.toLowerCase().includes(name.toLowerCase())) return 'weak';
  let points = 0;
  if (chars.length >= 14) points++;
  if (chars.length >= 20) points++;
  if (CLASSES.filter((c) => c.test(text)).length >= 3) points++;
  return (['weak', 'fair', 'good', 'strong'] as const)[points]!;
}

// --- Recovery code ---

/**
 * A recovery code as typed or pasted → its canonical form
 * (`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`), or null while it is not a whole code.
 * Tolerant of case, spaces and dashes, and of O for 0 and I or L for 1
 * (src/cloud/crypto/recovery.ts).
 */
export function checkRecoveryCode(typed: string): string | null {
  return parseRecoveryCode(typed);
}
