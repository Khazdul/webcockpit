// Makes tests/fixtures/cloud-crypto-vectors.json: the test vectors of the
// account crypto (src/cloud/crypto, spec §7.3, ADR 0145 "As built (stage
// 60, crypto)").
//
// This is a second implementation of every format, on node:crypto's own
// primitives (pbkdf2Sync, hkdfSync, createCipheriv, createHmac). It must
// never import from src/cloud/crypto: the unit tests check that module
// against this file's output, and two implementations that agree are the
// evidence that the formats are what the ADR says.
//
//   node scripts/gen-cloud-crypto-vectors.ts           writes the file
//   node scripts/gen-cloud-crypto-vectors.ts --check   fails if the file differs
//
// The checked-in file is the contract. It is regenerated only to ADD
// vectors (the existing ones must come out byte for byte the same: run
// --check first). If a vector changes, the format changed, and data
// already stored by players no longer opens.

import { createCipheriv, createHmac, hkdfSync, pbkdf2Sync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('../tests/fixtures/cloud-crypto-vectors.json', import.meta.url);

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const unhex = (s: string): Buffer => Buffer.from(s.replace(/\s+/g, ''), 'hex');
const b64u = (b: Uint8Array): string => Buffer.from(b).toString('base64url');
const text = (s: string): Buffer => Buffer.from(s, 'utf8');
/** Deterministic filler bytes: start, start+step, … (mod 256). */
const seq = (n: number, start: number, step = 1): Buffer => Buffer.from(Array.from({ length: n }, (_, i) => (start + i * step) & 0xff));

const hkdf = (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array | string, n = 32): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, salt, typeof info === 'string' ? text(info) : info, n));

const EMPTY = Buffer.alloc(0);

/** 16-bit big-endian length, then the UTF-8 bytes. */
function field(s: string): Buffer {
  const body = text(s);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length);
  return Buffer.concat([len, body]);
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

/** AES-256-GCM: ciphertext | tag (16). */
function gcm(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plain: Uint8Array): Buffer {
  const c = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  c.setAAD(aad);
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}

const blobAad = (kind: string, id: string): Buffer => Buffer.concat([Buffer.from([0x01, 0x42]), field(kind), field(id)]);

/** version | nonce | ciphertext | tag */
const blob = (key: Uint8Array, kind: string, id: string, nonce: Uint8Array, plain: Uint8Array): Buffer =>
  Buffer.concat([Buffer.from([0x01]), nonce, gcm(key, nonce, blobAad(kind, id), plain)]);

const segmentAad = (kind: string, id: string, size: number, bodyId: Uint8Array, index: number, final: boolean): Buffer =>
  Buffer.concat([Buffer.from([0x01, 0x53]), field(kind), field(id), u32(size), bodyId, u32(index), Buffer.from([final ? 1 : 0])]);

/** header (version | size | body id) | segments; the last piece (1..size bytes, or none for an empty body) is the final one. */
function body(key: Uint8Array, kind: string, id: string, size: number, bodyId: Uint8Array, nonces: Uint8Array[], plain: Uint8Array): Buffer {
  if (bodyId.length !== 16) throw new Error('a body id is 16 bytes');
  const pieces: Uint8Array[] = [];
  for (let at = 0; at < plain.length; at += size) pieces.push(plain.subarray(at, at + size));
  if (pieces.length === 0) pieces.push(EMPTY);
  if (nonces.length !== pieces.length) throw new Error(`body needs ${pieces.length} nonces`);
  const out: Buffer[] = [Buffer.from([0x01]), u32(size), Buffer.from(bodyId)];
  pieces.forEach((piece, i) => {
    out.push(Buffer.from(nonces[i]!), gcm(key, nonces[i]!, segmentAad(kind, id, size, bodyId, i, i === pieces.length - 1), piece));
  });
  return Buffer.concat(out);
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 15 bytes → 24 characters, 5 bits each from the most significant end, in six groups. */
function recoveryCode(bytes: Uint8Array): string {
  if (bytes.length !== 15) throw new Error('15 bytes');
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let chars = '';
  for (let i = 23; i >= 0; i--) chars += ALPHABET[Number((n >> BigInt(i * 5)) & 31n)];
  return chars.match(/.{4}/g)!.join('-');
}

const opaqueId = (idKey: Uint8Array, kind: string, localKey: string): { mac: Buffer; id: string } => {
  const mac = createHmac('sha256', idKey).update(Buffer.concat([field(kind), field(localKey)])).digest();
  return { mac, id: b64u(mac.subarray(0, 16)) };
};

/** The PBKDF2 salt is the server's salt followed by the lowercased account name as a field. */
function passwordKeys(
  account: string,
  password: string,
  salt: Uint8Array,
  rounds: number,
): { normalised: Buffer; pbkdf2Salt: Buffer; master: Buffer; authKey: Buffer; kek: Buffer } {
  const normalised = text(password.normalize('NFKC'));
  const pbkdf2Salt = Buffer.concat([salt, field(account.toLowerCase())]);
  const master = pbkdf2Sync(normalised, pbkdf2Salt, rounds, 32, 'sha256');
  return { normalised, pbkdf2Salt, master, authKey: hkdf(master, EMPTY, 'wc-auth'), kek: hkdf(master, EMPTY, 'wc-kek') };
}

function recoveryKeys(bytes: Uint8Array, account: string): { recoveryAuth: Buffer; recoveryKek: Buffer } {
  const salt = text(account.toLowerCase());
  return { recoveryAuth: hkdf(bytes, salt, 'wc-recovery-auth'), recoveryKek: hkdf(bytes, salt, 'wc-recovery-kek') };
}

// --- Public known-answer vectors (checked against node:crypto before use) ---

const rfc5869 = [
  {
    name: 'RFC 5869 A.1',
    ikm: '0b'.repeat(22),
    salt: '000102030405060708090a0b0c',
    info: 'f0f1f2f3f4f5f6f7f8f9',
    length: 42,
    okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  },
  {
    name: 'RFC 5869 A.2',
    ikm: hex(seq(80, 0x00)),
    salt: hex(seq(80, 0x60)),
    info: hex(seq(80, 0xb0)),
    length: 82,
    okm:
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09' +
      'da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87',
  },
  {
    name: 'RFC 5869 A.3 (no salt, no info)',
    ikm: '0b'.repeat(22),
    salt: '',
    info: '',
    length: 42,
    okm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
  },
];

const rfc7914 = [
  {
    name: 'RFC 7914 §11, c = 1',
    password: 'passwd',
    salt: 'salt',
    rounds: 1,
    length: 64,
    dk:
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' +
      '49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
  },
  {
    name: 'RFC 7914 §11, c = 80000',
    password: 'Password',
    salt: 'NaCl',
    rounds: 80000,
    length: 64,
    dk:
      '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56' +
      'a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d',
  },
];

for (const v of rfc5869) {
  const got = hex(hkdf(unhex(v.ikm), unhex(v.salt), unhex(v.info), v.length));
  if (got !== v.okm) throw new Error(`${v.name}: node:crypto disagrees with the published vector`);
}
for (const v of rfc7914) {
  const got = hex(pbkdf2Sync(v.password, v.salt, v.rounds, v.length, 'sha256'));
  if (got !== v.dk) throw new Error(`${v.name}: node:crypto disagrees with the published vector`);
}

// --- Our formats ---

const ACCOUNT = 'Gandalf_the-Grey'; // mixed case: the lowercased name is what is bound
const ROOT = seq(32, 0xa0, 3);
const dataKey = hkdf(ROOT, EMPTY, 'wc-data');
const idKey = hkdf(ROOT, EMPTY, 'wc-id');

const passwords: { name: string; password: string; rounds: number }[] = [
  { name: 'ASCII', password: 'correct horse battery staple', rounds: 1000 },
  { name: 'composed (NFC) characters', password: 'café-lösenord', rounds: 1000 },
  { name: 'the same password decomposed (NFD): the same keys', password: 'café-lösenord', rounds: 1000 },
  { name: 'compatibility forms (full width, a ligature, a circled digit): NFKC gives "Passfish1"', password: 'Ｐａssﬁsh①', rounds: 1000 },
  { name: 'the same password plain: the same keys', password: 'Passfish1', rounds: 1000 },
  { name: 'Cyrillic, Han and an emoji outside the BMP', password: 'пароль-密碼-\u{1f5dd}️', rounds: 1000 },
  { name: 'spaces are kept, at the ends too', password: '  two  spaces  ', rounds: 1000 },
  { name: 'the real round count', password: 'Mellon! Speak, friend, and enter.', rounds: 600000 },
];

const passwordVectors = passwords.map((p, i) => {
  // The pairs that must agree share a salt; the others get their own.
  const salt = seq(16, p.name.startsWith('the same password') ? 0x10 * i : 0x10 * (i + 1), 7);
  const k = passwordKeys(ACCOUNT, p.password, salt, p.rounds);
  const nonce = seq(12, 0x30 + i);
  return {
    name: p.name,
    password: p.password,
    normalisedUtf8: hex(k.normalised),
    account: ACCOUNT,
    salt: hex(salt),
    pbkdf2Salt: hex(k.pbkdf2Salt),
    rounds: p.rounds,
    master: hex(k.master),
    authKey: hex(k.authKey),
    kek: hex(k.kek),
    root: hex(ROOT),
    nonce: hex(nonce),
    wrapPw: hex(blob(k.kek, 'wrap-pw', ACCOUNT.toLowerCase(), nonce, ROOT)),
  };
});

const recoveryVectors = [seq(15, 0x00, 0), seq(15, 0xff, 0), seq(15, 0x01, 0x11), unhex('f81d4fae7dec11d0a76500a0c91e6b'), seq(15, 0x84, 0x21)].map((bytes, i) => {
  const k = recoveryKeys(bytes, ACCOUNT);
  const nonce = seq(12, 0x50 + i);
  return {
    bytes: hex(bytes),
    code: recoveryCode(bytes),
    account: ACCOUNT,
    recoveryAuth: hex(k.recoveryAuth),
    recoveryKek: hex(k.recoveryKek),
    root: hex(ROOT),
    nonce: hex(nonce),
    wrapRc: hex(blob(k.recoveryKek, 'wrap-rc', ACCOUNT.toLowerCase(), nonce, ROOT)),
  };
});

const blobCases: { kind: string; id: string; plaintext: Buffer }[] = [
  { kind: 'profile', id: 'x7Jq0b9sT2mVw4Lr8yKd1A', plaintext: text('{"name":"default","text":"#alias k kill %1"}') },
  { kind: 'settings', id: 'desktop', plaintext: text('{"v":3}') },
  { kind: 'script', id: 'x7Jq0b9sT2mVw4Lr8yKd1A', plaintext: EMPTY },
  { kind: 'scriptData', id: 'räksmörgås/\u{1f9d9}', plaintext: seq(100, 0, 5) },
  { kind: '', id: '', plaintext: Buffer.from([0]) },
  // The same bytes when kind and id are joined without lengths: the associated data must differ.
  { kind: 'ab', id: 'c', plaintext: text('split') },
  { kind: 'a', id: 'bc', plaintext: text('split') },
];

const blobVectors = blobCases.map((c, i) => {
  const nonce = seq(12, 0x70 + i * 2);
  return {
    kind: c.kind,
    id: c.id,
    nonce: hex(nonce),
    plaintext: hex(c.plaintext),
    aad: hex(blobAad(c.kind, c.id)),
    blob: hex(blob(dataKey, c.kind, c.id, nonce, c.plaintext)),
  };
});

const idVectors = [
  ['profile', 'default'],
  ['profile', 'khazdul'],
  ['run', 'Gimli/2026-11-14T09:30:00Z'],
  ['script', 'räksmörgås \u{1f9d9}'],
  ['ab', 'c'],
  ['a', 'bc'],
  ['', ''],
].map(([kind, localKey]) => {
  const { mac, id } = opaqueId(idKey, kind!, localKey!);
  return { kind, localKey, mac: hex(mac), id };
});

const RUN_ID = opaqueId(idKey, 'run', 'Gimli/2026-11-14T09:30:00Z').id;
const bodyVectors = [
  { name: 'an empty body: one final segment of no bytes', size: 16, bytes: 0 },
  { name: 'shorter than a segment', size: 16, bytes: 5 },
  { name: 'exactly one segment', size: 16, bytes: 16 },
  { name: 'exactly two segments', size: 16, bytes: 32 },
  { name: 'two segments and a part', size: 16, bytes: 40 },
  { name: 'another segment size', size: 1000, bytes: 2500 },
].map((c, i) => {
  const plain = seq(c.bytes, i, 13);
  const count = Math.max(1, Math.ceil(c.bytes / c.size));
  const bodyId = seq(16, 0x08 + i * 0x10, 9);
  const nonces = Array.from({ length: count }, (_, j) => seq(12, 0x90 + i * 8 + j, 3));
  return {
    name: c.name,
    kind: 'run',
    id: RUN_ID,
    segmentSize: c.size,
    bodyId: hex(bodyId),
    nonces: nonces.map(hex),
    plaintext: hex(plain),
    body: hex(body(dataKey, 'run', RUN_ID, c.size, bodyId, nonces, plain)),
  };
});

// A whole registration at the real round count, as the register request carries it.
const registration = (() => {
  const password = 'Lösenord för Khazâd-dûm'; // "â" decomposed on purpose
  const salt = seq(16, 0xc1, 5);
  const codeBytes = unhex('0f1e2d3c4b5a69788796a5b4c3d2e1');
  const noncePw = seq(12, 0xd0);
  const nonceRc = seq(12, 0xe0);
  const pw = passwordKeys(ACCOUNT, password, salt, 600000);
  const rc = recoveryKeys(codeBytes, ACCOUNT);
  return {
    account: ACCOUNT,
    password,
    // What the module draws from its random source, in this order.
    random: [hex(ROOT), hex(salt), hex(noncePw), hex(codeBytes), hex(nonceRc)],
    recoveryCode: recoveryCode(codeBytes),
    request: {
      salt: b64u(salt),
      kdf: { name: 'pbkdf2-sha256', rounds: 600000 },
      authKey: b64u(pw.authKey),
      recoveryAuth: b64u(rc.recoveryAuth),
      wrapPw: b64u(blob(pw.kek, 'wrap-pw', ACCOUNT.toLowerCase(), noncePw, ROOT)),
      wrapRc: b64u(blob(rc.recoveryKek, 'wrap-rc', ACCOUNT.toLowerCase(), nonceRc, ROOT)),
    },
    // The account's keys come from `root.root` below: the blobs, ids and bodies of this file open with them.
  };
})();

const vectors = {
  _comment: [
    'Test vectors of the account crypto (src/cloud/crypto; spec 7.3; ADR 0145, "As built (stage 60, crypto)").',
    'Made by scripts/gen-cloud-crypto-vectors.ts with node:crypto, not with the module under test.',
    'THIS FILE IS THE CONTRACT OF THE FORMATS. A failing vector means the format changed: data that players',
    'have stored no longer opens and their devices no longer agree. Never fix a failing vector by regenerating.',
    'Regenerate only to add vectors, and only when --check passes on the existing ones first.',
    'Binary values are hex, except in registration.request (base64url without padding, as on the wire).',
  ],
  public: { hkdf: rfc5869, pbkdf2: rfc7914 },
  base64url: [
    { hex: '', text: '' },
    { hex: '00', text: 'AA' },
    { hex: 'fbff', text: '-_8' },
    { hex: 'fbffbf', text: '-_-_' },
    { hex: hex(seq(16, 0xf0)), text: b64u(seq(16, 0xf0)) },
    { hex: hex(seq(61, 0x3e, 0x3f)), text: b64u(seq(61, 0x3e, 0x3f)) },
  ],
  password: passwordVectors,
  recovery: recoveryVectors,
  root: { root: hex(ROOT), dataKey: hex(dataKey), idKey: hex(idKey) },
  blobs: blobVectors,
  ids: idVectors,
  bodies: bodyVectors,
  registration,
};

// Non-ASCII as \u escapes: an editor or a tool that normalises text must not be able to merge the composed and
// decomposed passwords.
const json = JSON.stringify(vectors, null, 2).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';

if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== json) {
    console.error('tests/fixtures/cloud-crypto-vectors.json differs from what this script makes.');
    process.exit(1);
  }
  console.log('The vectors are what this script makes.');
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${OUT.pathname}`);
}
