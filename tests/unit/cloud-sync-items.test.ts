// Stage 61 (ADR 0151): the sync's item bodies, hash, names, device label,
// the codec over the blob format, and the server model's contract.
import { describe, expect, it } from 'vitest';
import { deriveKeys, makeRoot, opaqueId, seal, toBase64Url } from '../../src/cloud/crypto';
import { ItemCodec } from '../../src/cloud/sync/codec';
import {
  PROFILE_NAMES,
  SCRIPT_NAMES,
  canonicalJson,
  contentHash,
  copyKey,
  decodeBody,
  deviceWord,
  encodeBody,
  freeName,
  keepBothName,
  profileSpec,
  scriptSpec,
  shortDate,
  syncDeviceLabel,
} from '../../src/cloud/sync/items';
import { backoffMs } from '../../src/cloud/sync/status';
import { ServerModel, validName } from './cloud-sync-model';

const profile = { id: 'p-1', name: 'warrior', text: '#alias {k} {kill %1}', created: 1, modified: 2 };
const script = { id: 's-1', name: 'healer', source: 'print(1)', enabled: true, created: 3, updated: 4 };
const enc = new TextEncoder();
const NOV14 = new Date(2026, 10, 14, 12).getTime();

describe('canonical encoding and hash', () => {
  it('sorts keys and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
    expect(() => canonicalJson({ a: NaN })).toThrow();
  });

  it('is the same for the same record in any key order, and differs by kind and content', async () => {
    const h = await contentHash('profile', profile);
    expect(h).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await contentHash('profile', { modified: 2, created: 1, text: profile.text, name: 'warrior', id: 'p-1' })).toBe(h);
    expect(await contentHash('script', profile)).not.toBe(h);
    expect(await contentHash('profile', { ...profile, text: profile.text + ' ' })).not.toBe(h);
  });

  it('is pinned (a change here makes every synced item look edited)', async () => {
    expect(await contentHash('profile', { id: 'a', name: 'b', text: 'c', created: 0, modified: 0 })).toMatchInlineSnapshot(`"ziTaDSlU8Oz-4IP5O9RSKlY7FqBO65H5cXQtS-E3uBk"`);
  });
});

describe('bodies', () => {
  it('carry v and read back as the record without it', async () => {
    const bytes = await encodeBody(profileSpec, profile);
    expect(new TextDecoder().decode(bytes)).toBe(canonicalJson({ ...profile, v: 1 }));
    expect(await decodeBody(profileSpec, bytes)).toEqual({ ok: true, body: profile });
    expect(await decodeBody(scriptSpec, await encodeBody(scriptSpec, script))).toEqual({ ok: true, body: script });
  });

  it('refuse a newer v and anything that is not a body', async () => {
    const j = (x: unknown) => enc.encode(JSON.stringify(x));
    expect(await decodeBody(profileSpec, j({ ...profile, v: 2 }))).toEqual({ ok: false, why: 'newer' });
    expect(await decodeBody(profileSpec, j({ ...profile, v: 0 }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(profileSpec, j({ ...profile }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(profileSpec, j({ ...profile, v: 1, text: 5 }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(profileSpec, j({ ...profile, v: 1, id: '' }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(scriptSpec, j({ ...script, v: 1, enabled: 'yes' }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(profileSpec, j([1]))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(profileSpec, enc.encode('{nope'))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(profileSpec, Uint8Array.of(0xff, 0xfe))).toEqual({ ok: false, why: 'unreadable' });
  });

  it('drop fields they do not know at v1 (a new field must raise v)', async () => {
    expect(await decodeBody(profileSpec, enc.encode(JSON.stringify({ ...profile, v: 1, extra: 1 })))).toEqual({ ok: true, body: profile });
  });
});

describe('names and labels', () => {
  it('device labels', () => {
    expect(syncDeviceLabel('phone', 'chrome')).toBe('phone');
    expect(syncDeviceLabel('tablet', 'safari')).toBe('tablet');
    expect(syncDeviceLabel('desktop', 'firefox')).toBe('desktop, Firefox');
    expect(syncDeviceLabel('desktop', 'samsung')).toBe('desktop, Samsung');
    expect(syncDeviceLabel('desktop', 'other')).toBe('desktop');
    expect(deviceWord('desktop, Firefox')).toBe('Firefox');
    expect(deviceWord('phone')).toBe('phone');
    expect(deviceWord('Samsung Internet')).toBe('Samsung');
    expect(deviceWord('')).toBe('device');
  });

  it('short dates', () => {
    expect(shortDate(NOV14)).toBe('14 Nov');
    expect(shortDate(new Date(2027, 0, 2).getTime())).toBe('2 Jan');
  });

  it('keep-both names follow the name rules, cut the name and not the date', () => {
    expect(keepBothName('warrior', 'phone', NOV14, new Set(), PROFILE_NAMES)).toBe('warrior_from_phone_14Nov');
    expect(keepBothName('warrior', 'desktop, Firefox', NOV14, new Set(), PROFILE_NAMES)).toBe('warrior_from_Firefox_14Nov');
    const long = keepBothName('a_very_long_profile_name_of_32ch', 'desktop, Firefox', NOV14, new Set(), PROFILE_NAMES);
    expect(long).toBe('a_very_long_p_from_Firefox_14Nov');
    expect(validName('profile', long)).toBe(true);
    expect(keepBothName('warrior', 'phone', NOV14, new Set(['warrior_from_phone_14Nov']), PROFILE_NAMES)).toBe('warrior_from_phone_14Nov_2');
    expect(validName('script', keepBothName('heal-er', 'tablet', NOV14, new Set(), SCRIPT_NAMES))).toBe(true);
  });

  it('free names', () => {
    expect(freeName('a', new Set(), PROFILE_NAMES)).toBe('a');
    expect(freeName('a', new Set(['a', 'a_2']), PROFILE_NAMES)).toBe('a_3');
    const n = freeName('x'.repeat(32), new Set(['x'.repeat(32)]), PROFILE_NAMES);
    expect(n).toBe('x'.repeat(30) + '_2');
  });

  it('copy keys are UUIDs made from what is copied', async () => {
    const a = await copyKey('profile', 'p-1', 3, 'hash');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await copyKey('profile', 'p-1', 3, 'hash')).toBe(a);
    expect(await copyKey('profile', 'p-1', 4, 'hash')).not.toBe(a);
  });
});

describe('back-off', () => {
  it('grows to five minutes, with ±20 % jitter', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map((n) => backoffMs(n, () => 0.5))).toEqual([5000, 15000, 30000, 60000, 120000, 300000, 300000, 300000]);
    expect(backoffMs(1, () => 0)).toBe(4000);
    expect(backoffMs(1, () => 0.999999)).toBe(6000);
  });
});

describe('the codec', async () => {
  const keys = await deriveKeys(makeRoot());
  const codec = new ItemCodec(keys);

  it('server ids are the opaque ids of the local key', async () => {
    const sid = await codec.serverId('profile', 'p-1');
    expect(sid).toBe(await opaqueId(keys.idKey, 'profile', 'p-1'));
    expect(sid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await codec.serverId('script', 'p-1')).not.toBe(sid);
  });

  it('seals and opens; the blob is bound to kind and id', async () => {
    const sid = await codec.serverId('profile', 'p-1');
    const blob = toBase64Url(await codec.seal(profileSpec, sid, profile));
    expect(await codec.open(profileSpec, sid, blob)).toEqual({ ok: true, body: profile });
    const other = await codec.serverId('profile', 'p-2');
    expect(await codec.open(profileSpec, other, blob)).toEqual({ ok: false, why: 'unreadable' });
    expect(await codec.open(profileSpec, sid, 'AQAA')).toEqual({ ok: false, why: 'unreadable' });
    expect(await codec.open(profileSpec, sid, '!!')).toEqual({ ok: false, why: 'unreadable' });
  });

  it('a body under another item id is unreadable', async () => {
    const sid = await codec.serverId('profile', 'p-2');
    const blob = toBase64Url(await codec.seal(profileSpec, sid, profile)); // body says p-1
    expect(await codec.open(profileSpec, sid, blob)).toEqual({ ok: false, why: 'unreadable' });
  });

  it('a newer blob or body version is newer', async () => {
    const sid = await codec.serverId('profile', 'p-1');
    const v2 = toBase64Url(await seal(keys.dataKey, 'profile', sid, enc.encode(JSON.stringify({ ...profile, v: 2 }))));
    expect(await codec.open(profileSpec, sid, v2)).toEqual({ ok: false, why: 'newer' });
    const blob = await codec.seal(profileSpec, sid, profile);
    blob[0] = 2;
    expect(await codec.open(profileSpec, sid, toBase64Url(blob))).toEqual({ ok: false, why: 'newer' });
  });
});

describe('the server model', () => {
  const id = (n: number) => `${'A'.repeat(21)}${n}`;
  const b = (n: number) => new Uint8Array(n);

  it('rev, seq, tombstones, 409 with the current item', () => {
    const s = new ServerModel();
    expect(s.put('profile', id(1), 0, b(3))).toMatchObject({ status: 200, body: { rev: 1, seq: 1, usage: { items: 1, itemBytes: 3 } } });
    expect(s.put('profile', id(1), 0, b(3))).toMatchObject({ status: 409, body: { error: 'conflict', current: { rev: 1, seq: 1, deleted: false } } });
    expect(s.put('profile', id(1), 1, b(4))).toMatchObject({ status: 200, body: { rev: 2, seq: 2 } });
    expect(s.remove('profile', id(1), 1)).toMatchObject({ status: 409, body: { current: { rev: 2 } } });
    expect(s.remove('profile', id(1), 2)).toMatchObject({ status: 200, body: { rev: 3, seq: 3, usage: { items: 0, itemBytes: 0 } } });
    // A put on the tombstone with its rev brings the item back.
    expect(s.put('profile', id(1), 0, b(1))).toMatchObject({ status: 409, body: { current: { rev: 3, deleted: true } } });
    expect(s.put('profile', id(1), 3, b(1))).toMatchObject({ status: 200, body: { rev: 4, seq: 4 } });
    // A missing item: 409 with a tombstone of rev 0.
    expect(s.put('profile', id(2), 5, b(1))).toMatchObject({ status: 409, body: { current: { rev: 0, deleted: true } } });
  });

  it('pages changes oldest first with more and cursor', () => {
    const s = new ServerModel();
    for (let i = 0; i < 5; i++) s.put('script', id(i), 0, b(1));
    const p1 = s.changes(0, 2).body as { items: { seq: number }[]; cursor: number; more: boolean };
    expect(p1.items.map((x) => x.seq)).toEqual([1, 2]);
    expect(p1).toMatchObject({ cursor: 2, more: true });
    const p3 = s.changes(4, 2).body as { items: unknown[]; cursor: number; more: boolean };
    expect(p3).toMatchObject({ cursor: 5, more: false });
    expect(s.changes(5).body).toMatchObject({ items: [], cursor: 5, more: false });
  });

  it('limits: one item, all bytes, the count', () => {
    const s = new ServerModel();
    s.limits = { ...s.limits, itemMaxBytes: 10, itemBytes: 15, items: 2 };
    expect(s.put('profile', id(1), 0, b(11))).toMatchObject({ status: 413, body: { error: 'item_too_large' } });
    expect(s.put('profile', id(1), 0, b(10)).status).toBe(200);
    expect(s.put('profile', id(2), 0, b(6))).toMatchObject({ status: 413, body: { error: 'storage_full' } });
    expect(s.put('profile', id(1), 1, b(9)).status).toBe(200); // a replace counts its own old size out
    expect(s.put('profile', id(2), 0, b(5)).status).toBe(200);
    expect(s.put('profile', id(3), 0, b(0))).toMatchObject({ status: 413, body: { error: 'too_many_items' } });
  });

  it('refuses closed kinds and bad ids; an ended session answers 401', () => {
    const s = new ServerModel();
    expect(s.put('settings', id(1), 0, b(1))).toMatchObject({ status: 400, body: { error: 'kind_closed' } });
    expect(s.put('profile', 'short', 0, b(1))).toMatchObject({ status: 400 });
    s.ended = 'password';
    expect(s.changes(0)).toEqual({ status: 401, body: { error: 'session_ended', reason: 'password' } });
  });
});
