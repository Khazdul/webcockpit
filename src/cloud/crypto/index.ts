// The account crypto (spec §7.3, ADR 0145 "Keys" and its addendum "As
// built (stage 60, crypto)"). WebCrypto only.
//
// Nothing on the start-up or game path may import this statically: the
// pages and the sync engine load it with `import()` when an account is
// used (spec §7.0 rules 1 and 2).
//
// Every format written here has vectors in
// tests/fixtures/cloud-crypto-vectors.json, made with node:crypto
// (scripts/gen-cloud-crypto-vectors.ts). A failing vector means the format
// changed: stored data and other devices no longer agree.

export { type CryptoErrorCode, CloudCryptoError, isCryptoError } from './errors';
export { type Bytes, type RandomSource, accountLabel } from './bytes';
export { fromBase64Url, toBase64Url } from './base64url';
export { type KdfParams, type PasswordKeys, DEFAULT_KDF, KDF_NAME, MAX_ROUNDS, MIN_ROUNDS, SALT_BYTES, checkKdf } from './kdf';
export { type KdfOptions, type PasswordKdf, derivePasswordKeys, kdfWorkerAlive, stopKdfWorker } from './kdf-client';
export {
  type RecoveryKeys,
  RECOVERY_ALPHABET,
  deriveRecoveryKeys,
  lastGroup,
  lastGroupMatches,
  makeRecoveryCode,
  parseRecoveryCode,
} from './recovery';
export { type AccountKeys, type WrapKind, ROOT_BYTES, WRAP_BYTES, deriveKeys, makeRoot, openRoot, unwrapRoot, wrapRoot } from './root';
export { BLOB_OVERHEAD, BLOB_VERSION, open, seal } from './blob';
export {
  type BodyOptions,
  type ByteSource,
  BODY_VERSION,
  SEGMENT_SIZE,
  decryptBody,
  decryptBodyStream,
  encryptBody,
  encryptBodyStream,
  openBody,
  sealBody,
  sealedBodySize,
} from './segments';
export { opaqueId } from './ids';
export {
  type FlowOptions,
  type LoginParams,
  type PasswordSet,
  type RegisterKeys,
  changePassword,
  derivePasswordLogin,
  deriveRecoveryLogin,
  newRecoveryCode,
  prepareRegistration,
  recoverAccount,
  unlockWithPassword,
} from './account';
