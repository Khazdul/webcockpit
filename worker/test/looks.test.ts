// Own images and looks in the sync (stage 80 part D, ADR 0172): the kinds
// `lookImage` and `looks` are open; own images have a budget of their own
// (`lookImages`, `lookImageMaxBytes`, `lookBytes`; migration 0009's
// `look_count`, `look_bytes`), apart from the small items' `items` and
// `itemBytes`, with the same three 413 codes; and the measured size of a
// real 30 720-byte WebP's blob, built as the client builds it (canonical
// JSON with the base64, gzip, sealed).
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCOUNT_LIMITS, DEFAULT_KDF, LOOK_IMAGE_TARGET_BYTES, SESSION_COOKIE, type SyncChanges, type SyncWritten } from '../../shared/cloud/api.ts';
import { canonicalJson } from '../../src/core/canonical-json.ts';
import { seal } from '../../src/cloud/crypto/blob.ts';
import { toB64url } from '../bytes.ts';
import { handle } from '../router.ts';
import type { Deps } from '../runtime.ts';
import { LOOK_WEBP_BASE64 } from './fixtures/look-webp.ts';
import { T, at, count, db, emptyTables, envWith } from './helpers.ts';

const ORIGIN = 'https://example.test';
const NOW = T('2026-11-27T02:00:00Z');
const ENV = envWith({ API_LIMITER: undefined, AUTH_LIMITER: undefined });

const bytes = (n: number, fill: number): string => toB64url(Uint8Array.from({ length: n }, (_, i) => (fill * 31 + i * 7) & 255));
const blob = (n: number, fill = 1): Uint8Array<ArrayBuffer> => Uint8Array.from({ length: n }, (_, i) => (fill * 13 + i) & 255);
const idOf = (n: number): string => toB64url(Uint8Array.from({ length: 16 }, (_, i) => (n * 17 + i) & 255));

const siteverify: Deps['fetch'] = async (_url, init) => {
  const token = (JSON.parse(init?.body ?? '{}') as { response?: unknown }).response;
  return Response.json(token === 'ok' ? { success: true, hostname: 'example.com', 'error-codes': [] } : { success: false, 'error-codes': ['invalid-input-response'] });
};

function call(method: string, path: string, o: { cookie?: string; headers?: Record<string, string>; body?: BodyInit; ip?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '203.0.113.9', ...o.headers };
  if (o.cookie) headers.cookie = o.cookie;
  if (method !== 'GET') {
    headers['x-wc'] = '1';
    headers.origin = ORIGIN;
  }
  return handle(new Request(`${ORIGIN}${path}`, { method, headers, ...(o.body !== undefined ? { body: o.body } : {}) }), ENV, at(NOW, siteverify));
}

let ips = 0;
async function signUp(name: string): Promise<string> {
  ips++;
  const body = JSON.stringify({
    name,
    salt: bytes(16, 9),
    kdf: { ...DEFAULT_KDF },
    authKey: bytes(32, 1),
    recoveryAuth: bytes(32, 2),
    wrapPw: bytes(61, 3),
    wrapRc: bytes(61, 4),
    label: 'Firefox on Linux',
    turnstile: 'ok',
  });
  const res = await call('POST', '/api/auth/register', { body, ip: `198.51.100.${ips}` });
  expect(res.status, `register ${name}`).toBe(201);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? `${SESSION_COOKIE}=`;
}

const put = (cookie: string, kind: string, id: string, base: number, body: Uint8Array<ArrayBuffer>): Promise<Response> =>
  call('PUT', `/api/u/sync/items/${kind}/${id}`, { cookie, headers: { 'content-type': 'application/octet-stream', 'if-match': String(base) }, body });
const del = (cookie: string, kind: string, id: string, base: number): Promise<Response> => call('DELETE', `/api/u/sync/items/${kind}/${id}`, { cookie, headers: { 'if-match': String(base) } });

async function written(res: Response): Promise<SyncWritten> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as SyncWritten;
}
const errorOf = async (res: Response): Promise<[number, string]> => [res.status, ((await res.json()) as { error: string }).error];
async function changes(cookie: string): Promise<SyncChanges> {
  const res = await call('GET', '/api/u/sync/changes?since=0', { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncChanges;
}
async function setLimits(limits: Record<string, number>): Promise<void> {
  await db.prepare('UPDATE account SET limits = ?1').bind(JSON.stringify(limits)).run();
}

/** gzip by CompressionStream, as the client's `encodeBody` for a kind with `compress` (src/cloud/sync/items.ts). */
async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
/** A body's plaintext as the client makes it: UTF-8 of canonicalJson({ ...record, v }), gzipped or not. */
const plainOf = async (record: Record<string, unknown>, compress: boolean): Promise<Uint8Array<ArrayBuffer>> => {
  const json = new TextEncoder().encode(canonicalJson({ ...record, v: 1 })) as Uint8Array<ArrayBuffer>;
  return compress ? gzip(json) : json;
};

beforeEach(async () => {
  await emptyTables();
});

describe('the look kinds (stage 80, ADR 0172)', () => {
  it('lookImage and looks are open: a write, a change, a delete', async () => {
    const cookie = await signUp('alice');
    expect(await written(await put(cookie, 'lookImage', idOf(1), 0, blob(100)))).toEqual({ rev: 1, seq: 1, usage: { items: 0, itemBytes: 0, runBytes: 0, lookImages: 1, lookBytes: 100 } });
    // `looks` is a small item like the others: it counts against items and itemBytes.
    expect(await written(await put(cookie, 'looks', idOf(2), 0, blob(40)))).toEqual({ rev: 1, seq: 2, usage: { items: 1, itemBytes: 40, runBytes: 0, lookImages: 1, lookBytes: 100 } });
    expect(await written(await put(cookie, 'lookImage', idOf(1), 1, blob(150, 2)))).toMatchObject({ rev: 2, usage: { lookImages: 1, lookBytes: 150 } });
    expect(await written(await del(cookie, 'lookImage', idOf(1), 2))).toMatchObject({ rev: 3, usage: { items: 1, itemBytes: 40, lookImages: 0, lookBytes: 0 } });
    const ch = await changes(cookie);
    expect(ch.items.map((x) => [x.kind, x.rev, x.deleted])).toEqual([
      ['looks', 1, false],
      ['lookImage', 3, true],
    ]);
    expect(ch.usage).toEqual({ items: 1, itemBytes: 40, runBytes: 0, lookImages: 0, lookBytes: 0 });
    expect(ch.limits).toEqual(DEFAULT_ACCOUNT_LIMITS);
    expect(DEFAULT_ACCOUNT_LIMITS).toMatchObject({ lookImages: 50, lookImageMaxBytes: 32_768, lookBytes: 1_638_400 });
  });

  it('the count: at most lookImages own images, else 413 too_many_items; tombstones do not count; small items do not count', async () => {
    const cookie = await signUp('alice');
    await setLimits({ lookImages: 3, items: 2 });
    for (let i = 1; i <= 3; i++) await written(await put(cookie, 'lookImage', idOf(i), 0, blob(10, i)));
    expect(await errorOf(await put(cookie, 'lookImage', idOf(4), 0, blob(10)))).toEqual([413, 'too_many_items']);
    // The small items' count is apart: two profiles go in beside three images, a third is refused.
    await written(await put(cookie, 'profile', idOf(10), 0, blob(5)));
    await written(await put(cookie, 'looks', idOf(11), 0, blob(5)));
    expect(await errorOf(await put(cookie, 'script', idOf(12), 0, blob(5)))).toEqual([413, 'too_many_items']);
    // A change of one of the three is fine; a delete makes room.
    await written(await put(cookie, 'lookImage', idOf(2), 1, blob(12)));
    await written(await del(cookie, 'lookImage', idOf(1), 1));
    expect(await written(await put(cookie, 'lookImage', idOf(4), 0, blob(10)))).toMatchObject({ usage: { items: 2, lookImages: 3 } });
    // Bringing the tombstone back would be a fourth.
    expect(await errorOf(await put(cookie, 'lookImage', idOf(1), 2, blob(10)))).toEqual([413, 'too_many_items']);
    // The default: the 51st image is refused.
    await emptyTables();
    const bob = await signUp('bob');
    for (let i = 1; i <= 50; i++) await written(await put(bob, 'lookImage', idOf(100 + i), 0, blob(20, i)));
    expect(await errorOf(await put(bob, 'lookImage', idOf(200), 0, blob(20)))).toEqual([413, 'too_many_items']);
    expect(await count('item')).toBe(50);
  });

  it('the size: one image at most lookImageMaxBytes, else 413 item_too_large; the small items keep their 1 MB', async () => {
    const cookie = await signUp('alice');
    const max = DEFAULT_ACCOUNT_LIMITS.lookImageMaxBytes;
    expect(await errorOf(await put(cookie, 'lookImage', idOf(1), 0, blob(max + 1)))).toEqual([413, 'item_too_large']);
    expect(await written(await put(cookie, 'lookImage', idOf(1), 0, blob(max)))).toMatchObject({ usage: { lookImages: 1, lookBytes: max } });
    // Not the look limit for the other kinds: a looks item (and a profile) may be far larger.
    await written(await put(cookie, 'looks', idOf(2), 0, blob(max * 4)));
    // The account's own limit.
    await setLimits({ lookImageMaxBytes: 100 });
    expect(await errorOf(await put(cookie, 'lookImage', idOf(3), 0, blob(101)))).toEqual([413, 'item_too_large']);
    expect(await count('item')).toBe(2);
  });

  it('the budget: all images at most lookBytes, else 413 storage_full; apart from itemBytes both ways', async () => {
    const cookie = await signUp('alice');
    await setLimits({ lookBytes: 100, itemBytes: 50 });
    await written(await put(cookie, 'lookImage', idOf(1), 0, blob(60)));
    expect(await errorOf(await put(cookie, 'lookImage', idOf(2), 0, blob(41)))).toEqual([413, 'storage_full']);
    await written(await put(cookie, 'lookImage', idOf(2), 0, blob(40)));
    // The images' 100 bytes leave the small items' 50 untouched, and theirs do not touch the images'.
    expect(await written(await put(cookie, 'profile', idOf(3), 0, blob(50)))).toMatchObject({ usage: { itemBytes: 50, lookBytes: 100 } });
    expect(await errorOf(await put(cookie, 'looks', idOf(4), 0, blob(1)))).toEqual([413, 'storage_full']);
    // Over the limit (lowered): shrinking and deleting still go, growing not.
    await setLimits({ lookBytes: 50, itemBytes: 50 });
    expect(await written(await put(cookie, 'lookImage', idOf(1), 1, blob(55)))).toMatchObject({ usage: { lookBytes: 95 } });
    expect(await errorOf(await put(cookie, 'lookImage', idOf(1), 2, blob(56)))).toEqual([413, 'storage_full']);
    expect(await written(await del(cookie, 'lookImage', idOf(2), 1))).toMatchObject({ usage: { lookImages: 1, lookBytes: 55, items: 1, itemBytes: 50 } });
    // The account's usage says the same as the counters.
    const acc = await db.prepare('SELECT item_count, item_bytes, look_count, look_bytes FROM account').first();
    expect(acc).toEqual({ item_count: 1, item_bytes: 50, look_count: 1, look_bytes: 55 });
  });

  it('the account answer and the admin list carry the own images', async () => {
    const cookie = await signUp('alice');
    await written(await put(cookie, 'lookImage', idOf(1), 0, blob(70)));
    const res = await call('GET', '/api/u/account', { cookie });
    const acc = ((await res.json()) as { account: { usage: unknown; limits: unknown } }).account;
    expect(acc.usage).toEqual({ items: 0, itemBytes: 0, runBytes: 0, lookImages: 1, lookBytes: 70 });
    expect(acc.limits).toMatchObject({ lookImages: 50, lookImageMaxBytes: 32_768, lookBytes: 1_638_400 });
  });

  it('a real 30 720-byte WebP: its blob (gzip of the canonical JSON, sealed) fits lookImageMaxBytes, so gzip stays (ADR 0172)', async () => {
    const webp = LOOK_WEBP_BASE64;
    const raw = Uint8Array.from(atob(webp), (c) => c.charCodeAt(0));
    expect(raw.length).toBeLessThanOrEqual(LOOK_IMAGE_TARGET_BYTES);
    expect(raw.length).toBeGreaterThan(30_600);
    const id = 'AbCdEfGhIjKlMnOpQrStUv';
    const body = { id, label: 'A photo of my character, cropped', webp, created: NOW };
    const plain = await plainOf(body, true);
    const key = (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt'])) as CryptoKey;
    const sealed = await seal(key, 'lookImage', idOf(1), plain);
    // The measurement (ADR 0172): the WebP's 30 686 bytes as base64 in JSON are 41 KB; gzip brings them back to
    // within about 1 % of the picture, and the seal adds 29.
    const json = (await plainOf(body, false)).length;
    console.info(`stage 80 own image: webp ${raw.length} B, json ${json} B, gzip ${plain.length} B, blob ${sealed.length} B (limit ${DEFAULT_ACCOUNT_LIMITS.lookImageMaxBytes})`);
    expect(sealed.length).toBeLessThan(DEFAULT_ACCOUNT_LIMITS.lookImageMaxBytes);
    expect(sealed.length / raw.length).toBeLessThan(1.03);
    // And the server takes it.
    const cookie = await signUp('alice');
    expect(await written(await put(cookie, 'lookImage', idOf(1), 0, sealed as Uint8Array<ArrayBuffer>))).toMatchObject({ usage: { lookImages: 1, lookBytes: sealed.length } });
    // A looks body is small: 500 names fit far under the small items' 1 MB.
    const names: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) names[`name${String.fromCharCode(97 + (i % 26))}${i}`] = { look: { src: 'lib', id: 'elf-f-noldor' }, at: NOW + i };
    expect((await plainOf({ names }, false)).length).toBeLessThan(64 * 1024);
  });
});
