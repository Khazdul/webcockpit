// The server's checks (shared/cloud/api.ts, enforced by worker/accounts.ts)
// and the browser's crypto (src/cloud/crypto/kdf.ts) must agree on the KDF
// and the sizes, or one side refuses what the other makes (stage 60,
// ADR 0145). Each side keeps its own constants; this test ties them.
import { describe, expect, it } from 'vitest';
import * as api from '../../shared/cloud/api.ts';
import * as kdf from '../../src/cloud/crypto/kdf.ts';

describe('the account contract: server limits and browser crypto agree', () => {
  it('the KDF name, default rounds and bounds', () => {
    expect(api.KDF_NAME).toBe(kdf.KDF_NAME);
    expect(api.DEFAULT_KDF).toEqual(kdf.DEFAULT_KDF);
    expect(api.KDF_MIN_ROUNDS).toBe(kdf.MIN_ROUNDS);
    expect(api.KDF_MAX_ROUNDS).toBe(kdf.MAX_ROUNDS);
    expect(api.DEFAULT_KDF.rounds).toBeGreaterThanOrEqual(api.KDF_MIN_ROUNDS);
    expect(api.DEFAULT_KDF.rounds).toBeLessThanOrEqual(api.KDF_MAX_ROUNDS);
  });

  it('the salt is exactly the size the browser makes and accepts', () => {
    expect(api.SALT_MIN_BYTES).toBe(kdf.SALT_BYTES);
    expect(api.SALT_MAX_BYTES).toBe(kdf.SALT_BYTES);
  });

  it('authKey and recoveryAuth are the size of a derived key', () => {
    expect(api.AUTH_KEY_BYTES).toBe(kdf.KEY_BYTES);
  });
});
