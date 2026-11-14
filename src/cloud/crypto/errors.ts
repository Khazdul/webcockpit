// Errors of the account crypto (src/cloud/crypto, ADR 0145 "As built
// (stage 60, crypto)"). One class with a code, so a caller can tell the
// cases apart and the code survives the hop from the KDF worker.

export type CryptoErrorCode =
  /** A version byte this client does not know: a newer client wrote it. Keep the item untouched and ask for an update. */
  | 'unknown_version'
  /** Not the format at all: too short, a bad length, bad base64url. */
  | 'malformed'
  /** AES-GCM refused: the wrong key, the wrong kind or id, or changed bytes. */
  | 'auth'
  /** The password's key did not open the password wrap. */
  | 'wrong_password'
  /** The recovery code's key did not open the recovery wrap. */
  | 'wrong_code'
  /** KDF parameters this client refuses (unknown name, rounds out of range, a bad salt). */
  | 'bad_kdf'
  /** A caller's argument is not usable (a bad name, an over-long kind or id, a bad segment size). */
  | 'bad_input'
  /** The caller's AbortSignal fired. */
  | 'cancelled'
  /** The KDF worker could not be started or died. */
  | 'worker_failed';

export class CloudCryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CloudCryptoError';
    this.code = code;
  }
}

/** True for a `CloudCryptoError`, of `code` when one is given. */
export function isCryptoError(e: unknown, code?: CryptoErrorCode): e is CloudCryptoError {
  return e instanceof CloudCryptoError && (code === undefined || e.code === code);
}
