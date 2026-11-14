// The KDF worker (spec §7.3, §7.0 rule 1): PBKDF2 off the main thread.
// Started on demand by kdf-client.ts and ended by it when idle.
//
// It answers with the `authKey` bytes and the `kek` as a non-extractable
// `CryptoKey` (a CryptoKey crosses `postMessage` by structured clone), so
// the master key never reaches the page's thread: it exists here, for the
// length of one derivation, and is wiped.

import { CloudCryptoError } from './errors';
import { derivePasswordKeysChecked } from './kdf';
import type { KdfRequest, KdfResponse } from './kdf-client';

interface KdfScope {
  postMessage(m: KdfResponse, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<KdfRequest>) => void): void;
}

const scope = self as unknown as KdfScope;

scope.addEventListener('message', (e) => {
  const { id, password, salt, kdf } = e.data;
  derivePasswordKeysChecked(password, salt, kdf).then(
    ({ authKey, kek }) => scope.postMessage({ id, ok: true, authKey, kek }),
    (err: unknown) =>
      scope.postMessage({
        id,
        ok: false,
        code: err instanceof CloudCryptoError ? err.code : 'worker_failed',
        message: err instanceof Error ? err.message : String(err),
      }),
  );
});
