// Stage 60 (spec §7.3, ADR 0145 "As built (stage 60, crypto)"): the
// account crypto against tests/fixtures/cloud-crypto-vectors.json, which
// scripts/gen-cloud-crypto-vectors.ts made with node:crypto.
//
// THE VECTORS ARE THE CONTRACT OF THE FORMATS. A test that fails here
// means the format changed: what players have stored no longer opens and
// their devices no longer agree. Never make it pass by regenerating the
// file; find what changed in src/cloud/crypto.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  derivePasswordKeys,
  derivePasswordLogin,
  deriveRecoveryLogin,
  opaqueId,
  open,
  openBody,
  prepareRegistration,
  recoverAccount,
  seal,
  sealBody,
  unlockWithPassword,
} from '../../src/cloud/crypto';
import { fromBase64Url, toBase64Url } from '../../src/cloud/crypto/base64url';
import { blobAad } from '../../src/cloud/crypto/blob';
import { type Bytes, type RandomSource, utf8 } from '../../src/cloud/crypto/bytes';
import { derivePasswordKeysUnchecked, hkdf, passwordBytes, pbkdf2 } from '../../src/cloud/crypto/kdf';
import { deriveRecoveryKeys, encodeRecoveryCode, recoveryCodeBytes } from '../../src/cloud/crypto/recovery';
import { deriveKeys, unwrapRoot, wrapRoot } from '../../src/cloud/crypto/root';
import { decryptBody, encryptBody } from '../../src/cloud/crypto/segments';

interface Vectors {
  public: {
    hkdf: { name: string; ikm: string; salt: string; info: string; length: number; okm: string }[];
    pbkdf2: { name: string; password: string; salt: string; rounds: number; length: number; dk: string }[];
  };
  base64url: { hex: string; text: string }[];
  password: {
    name: string;
    password: string;
    normalisedUtf8: string;
    salt: string;
    rounds: number;
    master: string;
    authKey: string;
    /** Not checkable directly (the module's kek is non-extractable): through `wrapPw`. */
    kek: string;
    account: string;
    root: string;
    nonce: string;
    wrapPw: string;
  }[];
  recovery: { bytes: string; code: string; account: string; recoveryAuth: string; root: string; nonce: string; wrapRc: string }[];
  root: { root: string };
  blobs: { kind: string; id: string; nonce: string; plaintext: string; aad: string; blob: string }[];
  ids: { kind: string; localKey: string; id: string }[];
  bodies: { name: string; kind: string; id: string; segmentSize: number; nonces: string[]; plaintext: string; body: string }[];
  registration: {
    account: string;
    password: string;
    random: string[];
    recoveryCode: string;
    request: { salt: string; kdf: { name: 'pbkdf2-sha256'; rounds: number }; authKey: string; recoveryAuth: string; wrapPw: string; wrapRc: string };
  };
}

const V = JSON.parse(readFileSync(new URL('../fixtures/cloud-crypto-vectors.json', import.meta.url), 'utf8')) as Vectors;

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const unhex = (s: string): Bytes => new Uint8Array(Buffer.from(s, 'hex'));

/** A random source that hands out the given values in order and nothing else. */
function fixed(...values: string[]): RandomSource {
  let at = 0;
  return (n) => {
    const next = values[at++];
    if (next === undefined) throw new Error('more random bytes asked for than the vector has');
    const bytes = unhex(next);
    if (bytes.length !== n) throw new Error(`asked for ${n} random bytes, the vector's next value has ${bytes.length}`);
    return bytes;
  };
}

const keys = () => deriveKeys(unhex(V.root.root));

describe('public known-answer vectors', () => {
  it.each(V.public.hkdf)('HKDF-SHA-256: $name', async (v) => {
    expect(hex(await hkdf(unhex(v.ikm), unhex(v.salt), unhex(v.info), v.length))).toBe(v.okm);
  });

  it.each(V.public.pbkdf2)('PBKDF2-HMAC-SHA-256: $name', async (v) => {
    expect(hex(await pbkdf2(utf8(v.password), utf8(v.salt), v.rounds, v.length))).toBe(v.dk);
  });
});

describe('base64url', () => {
  it.each(V.base64url)('"$text"', (v) => {
    expect(toBase64Url(unhex(v.hex))).toBe(v.text);
    expect(hex(fromBase64Url(v.text))).toBe(v.hex);
  });
});

describe('password → master, authKey, kek', () => {
  it.each(V.password)('$name', async (v) => {
    expect(hex(passwordBytes(v.password))).toBe(v.normalisedUtf8);
    expect(hex(await pbkdf2(passwordBytes(v.password), unhex(v.salt), v.rounds))).toBe(v.master);
    const { authKey, kek } = await derivePasswordKeysUnchecked(v.password, unhex(v.salt), v.rounds);
    expect(hex(authKey)).toBe(v.authKey);
    // The kek cannot be exported: it is checked through the wrap it makes.
    const wrap = await wrapRoot(unhex(v.root), kek, 'wrap-pw', v.account, fixed(v.nonce));
    expect(hex(wrap)).toBe(v.wrapPw);
    expect(hex(await unwrapRoot(unhex(v.wrapPw), kek, 'wrap-pw', v.account))).toBe(v.root);
  });

  it('a composed and a decomposed spelling of one password give the same keys', () => {
    const [nfc, nfd] = [V.password[1]!, V.password[2]!];
    expect(nfc.password).not.toBe(nfd.password);
    expect(nfc.password.normalize('NFC')).toBe(nfd.password.normalize('NFC'));
    expect(nfd.authKey).toBe(nfc.authKey);
    expect(nfd.kek).toBe(nfc.kek);
    const [wide, plain] = [V.password[3]!, V.password[4]!];
    expect(wide.password).not.toBe(plain.password);
    expect(wide.authKey).toBe(plain.authKey);
    expect(wide.kek).toBe(plain.kek);
  });

  it('the checked path (the one the app takes) at 600 000 rounds', async () => {
    const v = V.password.find((p) => p.rounds === 600000)!;
    const { authKey, kek } = await derivePasswordKeys(v.password, unhex(v.salt), { name: 'pbkdf2-sha256', rounds: v.rounds });
    expect(hex(authKey)).toBe(v.authKey);
    expect(hex(await wrapRoot(unhex(v.root), kek, 'wrap-pw', v.account, fixed(v.nonce)))).toBe(v.wrapPw);
  });
});

describe('recovery code → recoveryAuth, recoveryKek', () => {
  it.each(V.recovery)('$code', async (v) => {
    expect(encodeRecoveryCode(unhex(v.bytes))).toBe(v.code);
    expect(hex(recoveryCodeBytes(v.code))).toBe(v.bytes);
    const { recoveryAuth, recoveryKek } = await deriveRecoveryKeys(v.code, v.account);
    expect(hex(recoveryAuth)).toBe(v.recoveryAuth);
    const wrap = await wrapRoot(unhex(v.root), recoveryKek, 'wrap-rc', v.account, fixed(v.nonce));
    expect(hex(wrap)).toBe(v.wrapRc);
    expect(hex(await unwrapRoot(unhex(v.wrapRc), recoveryKek, 'wrap-rc', v.account))).toBe(v.root);
  });
});

describe('root → dataKey, idKey', () => {
  it.each(V.blobs)('blob of "$kind" / "$id"', async (v) => {
    const { dataKey } = await keys();
    expect(hex(blobAad(v.kind, v.id))).toBe(v.aad);
    expect(hex(await seal(dataKey, v.kind, v.id, unhex(v.plaintext), fixed(v.nonce)))).toBe(v.blob);
    expect(hex(await open(dataKey, v.kind, v.id, unhex(v.blob)))).toBe(v.plaintext);
  });

  it.each(V.ids)('opaque id of "$kind" / "$localKey"', async (v) => {
    const { idKey } = await keys();
    const id = await opaqueId(idKey, v.kind, v.localKey);
    expect(id).toBe(v.id);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it.each(V.bodies)('segmented body: $name', async (v) => {
    const { dataKey } = await keys();
    const plain = unhex(v.plaintext);
    const opts = () => ({ segmentSize: v.segmentSize, random: fixed(...v.nonces) });
    expect(hex(await sealBody(dataKey, v.kind, v.id, plain, opts()))).toBe(v.body);
    expect(hex(await openBody(dataKey, v.kind, v.id, unhex(v.body)))).toBe(v.plaintext);
    // The same bytes whatever the chunking of the source.
    const drip = (async function* () {
      for (let at = 0; at < plain.length; at += 7) yield plain.subarray(at, at + 7);
    })();
    const out: Uint8Array[] = [];
    for await (const c of encryptBody(dataKey, v.kind, v.id, drip, opts())) out.push(c);
    expect(Buffer.concat(out).toString('hex')).toBe(v.body);
    const body = unhex(v.body);
    const back: Uint8Array[] = [];
    const bodyDrip = (function* () {
      for (let at = 0; at < body.length; at += 5) yield body.subarray(at, at + 5);
    })();
    for await (const c of decryptBody(dataKey, v.kind, v.id, bodyDrip)) back.push(c);
    expect(Buffer.concat(back).toString('hex')).toBe(v.plaintext);
  });
});

describe('a whole registration at 600 000 rounds', () => {
  const R = V.registration;

  it('gives the register request of the vector, and keys that make the vector ids', async () => {
    const { request, recoveryCode, keys: k } = await prepareRegistration(R.account, R.password, { random: fixed(...R.random) });
    expect(request).toEqual(R.request);
    expect(recoveryCode).toBe(R.recoveryCode);
    expect(fromBase64Url(request.salt)).toHaveLength(16);
    expect(fromBase64Url(request.authKey)).toHaveLength(32);
    expect(fromBase64Url(request.recoveryAuth)).toHaveLength(32);
    expect(fromBase64Url(request.wrapPw)).toHaveLength(61);
    expect(fromBase64Url(request.wrapRc)).toHaveLength(61);
    expect(await opaqueId(k.idKey, V.ids[0]!.kind, V.ids[0]!.localKey)).toBe(V.ids[0]!.id);
    expect(hex(await open(k.dataKey, V.blobs[0]!.kind, V.blobs[0]!.id, unhex(V.blobs[0]!.blob)))).toBe(V.blobs[0]!.plaintext);
  });

  it('a login with the password opens the account', async () => {
    const { authKey, kek } = await derivePasswordLogin(R.password, { salt: R.request.salt, kdf: R.request.kdf });
    expect(authKey).toBe(R.request.authKey);
    const k = await unlockWithPassword(R.account.toUpperCase(), kek, R.request.wrapPw);
    expect(await opaqueId(k.idKey, V.ids[2]!.kind, V.ids[2]!.localKey)).toBe(V.ids[2]!.id);
  });

  it('the recovery code opens the account', async () => {
    const { recoveryAuth, recoveryKek } = await deriveRecoveryLogin(R.account, R.recoveryCode.toLowerCase().replace(/-/g, ' '));
    expect(recoveryAuth).toBe(R.request.recoveryAuth);
    const { keys: k } = await recoverAccount(R.account, recoveryKek, R.request.wrapRc, 'a new password', {
      derive: (p, s) => derivePasswordKeysUnchecked(p, s, 1000),
    });
    expect(hex(await open(k.dataKey, V.blobs[1]!.kind, V.blobs[1]!.id, unhex(V.blobs[1]!.blob)))).toBe(V.blobs[1]!.plaintext);
  });
});
