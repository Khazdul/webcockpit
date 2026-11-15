// Stage 61 (ADR 0151): the sync's item bodies, hash, names, device label,
// the codec over the blob format, and the server model's contract.
import { describe, expect, it } from 'vitest';
import { deriveKeys, makeRoot, opaqueId, seal, toBase64Url } from '../../src/cloud/crypto';
import { ItemCodec } from '../../src/cloud/sync/codec';
import {
  PROFILE_NAMES,
  SCRIPT_NAMES,
  ITEM_SPECS,
  RUN_SPECS,
  SYNC_SPECS,
  SYNC_SPECS_WITH_RUNS,
  exportDocSpec,
  runSpec,
  canonicalJson,
  commIdentity,
  commSpec,
  contentHash,
  copyKey,
  decodeBody,
  deviceWord,
  encodeBody,
  freeName,
  gunzip,
  gzip,
  itemHashes,
  keepBothName,
  profileSpec,
  scriptDataSpec,
  scriptSpec,
  settingsSpec,
  timersSpec,
  utcDay,
  shortDate,
  syncDeviceLabel,
} from '../../src/cloud/sync/items';
import { backoffMs } from '../../src/cloud/sync/status';
import { SETTINGS_VERSION } from '../../src/settings/types';
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

// Stage 62 (ADR 0152): the small kinds.
describe('the small kinds', () => {
  const j = (x: unknown) => enc.encode(JSON.stringify(x));
  const settings = { type: 'phone', record: { version: SETTINGS_VERSION, appearance: { font: 'x' } } };
  const data = { name: 'finder', enabled: true, settings: { range: 3 }, store: { seen: ['a'] } };
  const timers = { character: 'Gandalf', savedAt: 5, state: { v: 1, groups: [] } };
  const msg = (ts: number, text: string, character = 'Gandalf') => ({ character, ts, channel: 'tell', talker: 'Frodo', talkerType: null, destination: null, text });

  it('are synced in the order profile, script, settings, scriptData, timers, comm; none has names', () => {
    expect(SYNC_SPECS.map((x) => x.kind)).toEqual(['profile', 'script', 'settings', 'scriptData', 'timers', 'comm']);
    for (const sp of [settingsSpec, scriptDataSpec, timersSpec, commSpec]) {
      expect(sp.version).toBe(1);
      expect(sp.names).toBeUndefined();
      expect(sp.policy).toBe(sp === commSpec ? 'merge' : 'lastWriter');
    }
  });

  it('settings: keyed by the device type; a newer settings version is newer, an older one is taken as it is', async () => {
    expect(settingsSpec.key(settings)).toBe('phone');
    expect(await decodeBody(settingsSpec, await encodeBody(settingsSpec, settings))).toEqual({ ok: true, body: settings });
    expect(await decodeBody(settingsSpec, j({ ...settings, v: 1, record: { version: SETTINGS_VERSION + 1 } }))).toEqual({ ok: false, why: 'newer' });
    expect(await decodeBody(settingsSpec, j({ ...settings, v: 1, record: { version: 2, old: true } }))).toEqual({ ok: true, body: { ...settings, record: { version: 2, old: true } } });
    expect(await decodeBody(settingsSpec, j({ ...settings, v: 2 }))).toEqual({ ok: false, why: 'newer' });
    for (const bad of [{ type: 'watch' }, { record: [] }, { record: { version: 'six' } }, { record: { version: 0 } }, { record: null }]) {
      expect(await decodeBody(settingsSpec, j({ ...settings, v: 1, ...bad })), JSON.stringify(bad)).toEqual({ ok: false, why: 'unreadable' });
    }
  });

  it('settings: an older body\'s `from` (the writer\'s label) is dropped on decode, whatever it holds; the hashes are as without it', async () => {
    const a = await itemHashes(settingsSpec, settings);
    for (const from of ['desktop, Chrome', 3, null]) {
      const d = await decodeBody(settingsSpec, j({ ...settings, from, v: 1 }));
      expect(d, JSON.stringify(from)).toEqual({ ok: true, body: settings });
      if (d.ok) expect(await itemHashes(settingsSpec, d.body)).toEqual(a);
    }
    expect((await itemHashes(settingsSpec, { ...settings, record: { version: SETTINGS_VERSION, appearance: { font: 'y' } } })).hash).not.toBe(a.hash);
  });

  it('scriptData: keyed by the script name; enabled optional; unknown fields dropped', async () => {
    expect(scriptDataSpec.key(data)).toBe('finder');
    expect(await decodeBody(scriptDataSpec, await encodeBody(scriptDataSpec, data))).toEqual({ ok: true, body: data });
    const { enabled: _e, ...bare } = data;
    expect(await decodeBody(scriptDataSpec, j({ ...bare, v: 1, extra: 1 }))).toEqual({ ok: true, body: bare });
    for (const bad of [{ name: '' }, { name: 3 }, { enabled: 'yes' }, { settings: [] }, { store: null }]) {
      expect(await decodeBody(scriptDataSpec, j({ ...data, v: 1, ...bad })), JSON.stringify(bad)).toEqual({ ok: false, why: 'unreadable' });
    }
  });

  it('timers: keyed by the character; any state', async () => {
    expect(timersSpec.key(timers)).toBe('Gandalf');
    expect(await decodeBody(timersSpec, await encodeBody(timersSpec, timers))).toEqual({ ok: true, body: timers });
    expect(await decodeBody(timersSpec, j({ character: 'Frodo', savedAt: 1, v: 1 }))).toEqual({ ok: true, body: { character: 'Frodo', savedAt: 1, state: null } });
    for (const bad of [{ character: '' }, { savedAt: '1' }, { savedAt: null }]) {
      expect(await decodeBody(timersSpec, j({ ...timers, v: 1, ...bad })), JSON.stringify(bad)).toEqual({ ok: false, why: 'unreadable' });
    }
  });

  it('comm: gzip of the canonical JSON; the hash over the JSON', async () => {
    const piece = { day: '2026-11-14', records: [msg(1, 'hi'), msg(2, 'there')] };
    const plain = await encodeBody(commSpec, piece);
    expect(plain[0]).toBe(0x1f); // gzip's magic
    expect(new TextDecoder().decode(await gunzip(plain))).toBe(canonicalJson({ ...piece, v: 1 }));
    expect(await decodeBody(commSpec, plain)).toEqual({ ok: true, body: piece });
    // Not gzip, or gzip of what is not a body: unreadable.
    expect(await decodeBody(commSpec, j({ ...piece, v: 1 }))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(commSpec, await gzip(enc.encode('{nope')))).toEqual({ ok: false, why: 'unreadable' });
    expect(await decodeBody(commSpec, await gzip(j({ ...piece, v: 2 })))).toEqual({ ok: false, why: 'newer' });
    expect(await itemHashes(commSpec, piece)).toEqual({ hash: await contentHash('comm', piece), bare: await contentHash('comm', piece) });
    // A body that would open to more than the cap is refused.
    await expect(gunzip(await gzip(new Uint8Array(2000)), 1000)).rejects.toThrow();
    // A sealed comm item round-trips through the codec.
    const keys = await deriveKeys(makeRoot());
    const codec = new ItemCodec(keys);
    const sid = await codec.serverId('comm', piece.day);
    expect(await codec.open(commSpec, sid, toBase64Url(await codec.seal(commSpec, sid, piece)))).toEqual({ ok: true, body: piece });
  });

  it('comm: decode sorts by ts then identity, drops seq and duplicates, checks every record and the day', async () => {
    const day = '2026-11-14.2';
    const a = msg(5, 'a');
    const b = msg(5, 'b');
    const c = msg(1, 'c');
    const d = await decodeBody(commSpec, await gzip(j({ v: 1, day, records: [{ ...b, seq: 9 }, a, c, { ...a, seq: 3 }] })));
    const sorted = [c, ...[a, b].sort((x, y) => (commIdentity(x) < commIdentity(y) ? -1 : 1))];
    expect(d).toEqual({ ok: true, body: { day, records: sorted } });
    for (const bad of [{ day: '14 Nov' }, { day: '2026-11-14.1' }, { day: '2026-11-14.02' }, { records: {} }, { records: [{ ...a, ts: 'x' }] }, { records: [{ ...a, talkerType: 1 }] }, { records: [7] }]) {
      expect(await decodeBody(commSpec, await gzip(j({ v: 1, day, records: [a], ...bad }))), JSON.stringify(bad)).toEqual({ ok: false, why: 'unreadable' });
    }
    expect(commSpec.key({ day, records: [] })).toBe(day);
    expect(utcDay(Date.UTC(2026, 10, 14, 23, 59))).toBe('2026-11-14');
  });

  it('comm: merge is the union by identity, sorted', () => {
    const day = '2026-11-14';
    const [m1, m2, m3] = [msg(1, 'one'), msg(2, 'two', 'Frodo'), msg(3, 'three')];
    expect(commSpec.merge!({ day, records: [m1, m3] }, { day, records: [m2, m3] })).toEqual({ day, records: [m1, m2, m3] });
    expect(commSpec.merge!({ day, records: [] }, { day, records: [m1] })).toEqual({ day, records: [m1] });
  });
});

// Stage 63 (ADR 0153): the kinds of runs in the cloud.
describe('the run kinds', () => {
  const j = (x: unknown) => enc.encode(JSON.stringify(x));
  const meta = {
    runId: 'r1',
    character: 'Gandalf',
    startedUs: 1_000,
    endedUs: 9_000,
    sealed: true,
    bytes: 30,
    lines: 3,
    saved: true,
    rating: 4,
    savedUs: 9_500,
    summary: { startUs: 1_000, lastEventUs: 8_000, kills: 1, pkills: 0, deaths: 0 },
  };
  const run = { runId: 'r1', meta, size: 1234 };
  const doc = { sessionId: 'r1', schema: 1, title: 'A fight', format: 'text', excludes: [[5, 9]], comments: [{ beforeUs: 6, text: 'here' }] };

  it('come after the others, last writer, v 1, no names; SYNC_SPECS is unchanged without the flag', () => {
    expect(SYNC_SPECS.map((x) => x.kind)).toEqual(['profile', 'script', 'settings', 'scriptData', 'timers', 'comm']);
    expect(RUN_SPECS).toEqual([runSpec, exportDocSpec]);
    expect(SYNC_SPECS_WITH_RUNS.map((x) => x.kind)).toEqual(['profile', 'script', 'settings', 'scriptData', 'timers', 'comm', 'run', 'exportDoc']);
    expect(ITEM_SPECS.run).toBe(runSpec);
    expect(ITEM_SPECS.exportDoc).toBe(exportDocSpec);
    for (const sp of RUN_SPECS) {
      expect(sp.version).toBe(1);
      expect(sp.policy).toBe('lastWriter');
      expect(sp.names).toBeUndefined();
      expect(sp.compress).toBeUndefined();
    }
  });

  it('run: keyed by runId; round-trips; an old meta without the optional fields too', async () => {
    expect(runSpec.key(run)).toBe('r1');
    expect(await decodeBody(runSpec, await encodeBody(runSpec, run))).toEqual({ ok: true, body: run });
    const bare = { runId: 'r1', character: 'Gandalf', startedUs: 1, endedUs: 2, sealed: true, bytes: 0, lines: 0, saved: true };
    expect(await decodeBody(runSpec, j({ v: 1, runId: 'r1', meta: bare, size: 0 }))).toEqual({ ok: true, body: { runId: 'r1', meta: bare, size: 0 } });
    expect(await decodeBody(runSpec, j({ v: 1, runId: 'r1', meta: { ...meta, summary: null, savedUs: null }, size: 1 }))).toMatchObject({ ok: true });
  });

  it('run: refuses a newer v, another run inside, a meta that is not one, unsaved or unsealed, a bad size', async () => {
    expect(await decodeBody(runSpec, j({ ...run, v: 2 }))).toEqual({ ok: false, why: 'newer' });
    const bads: unknown[] = [
      { ...run, runId: 'r2' },
      { ...run, runId: '' },
      { ...run, size: -1 },
      { ...run, size: 1.5 },
      { ...run, size: '5' },
      { ...run, meta: null },
      { ...run, meta: { ...meta, sealed: false } },
      { ...run, meta: { ...meta, saved: false } },
      { ...run, meta: { ...meta, saved: undefined } },
      { ...run, meta: { ...meta, rating: 6 } },
      { ...run, meta: { ...meta, rating: 2.5 } },
      { ...run, meta: { ...meta, bytes: 'x' } },
      { ...run, meta: { ...meta, savedUs: 'x' } },
      { ...run, meta: { ...meta, summary: { kills: 1 } } },
    ];
    for (const bad of bads) expect(await decodeBody(runSpec, j({ ...(bad as object), v: 1 })), JSON.stringify(bad)).toEqual({ ok: false, why: 'unreadable' });
  });

  it('run: drops meta fields it does not know (a new one must raise v)', async () => {
    expect(await decodeBody(runSpec, j({ ...run, v: 1, meta: { ...meta, extra: 1 }, other: 2 }))).toEqual({ ok: true, body: run });
  });

  it('exportDoc: keyed by the session; normalised as the store reads it', async () => {
    expect(exportDocSpec.key(doc)).toBe('r1');
    expect(await decodeBody(exportDocSpec, await encodeBody(exportDocSpec, doc))).toEqual({ ok: true, body: doc });
    // Bad ranges and comments are dropped, ranges merged (normalizeExportDoc).
    const messy = { ...doc, v: 1, excludes: [[5, 9], [8, 12], [3, 1], 'x'], comments: [{ beforeUs: 'x', text: 'a' }, { beforeUs: null, text: '  b  ' }] };
    expect(await decodeBody(exportDocSpec, j(messy))).toEqual({
      ok: true,
      body: { ...doc, excludes: [[5, 12]], comments: [{ beforeUs: null, text: 'b' }] },
    });
    expect(await decodeBody(exportDocSpec, j({ ...doc, v: 2 }))).toEqual({ ok: false, why: 'newer' });
    for (const bad of [{ sessionId: '' }, { sessionId: 5 }, { schema: 2 }]) {
      expect(await decodeBody(exportDocSpec, j({ ...doc, v: 1, ...bad })), JSON.stringify(bad)).toEqual({ ok: false, why: 'unreadable' });
    }
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
    expect(s.put('run', id(1), 0, b(1))).toMatchObject({ status: 400, body: { error: 'kind_closed' } });
    expect(s.put('exportDoc', id(1), 0, b(1))).toMatchObject({ status: 400, body: { error: 'kind_closed' } });
    for (const kind of ['settings', 'scriptData', 'comm', 'timers']) expect(s.put(kind, id(1), 0, b(1)).status, kind).toBe(200);
    expect(s.put('profile', 'short', 0, b(1))).toMatchObject({ status: 400 });
    s.ended = 'password';
    expect(s.changes(0)).toEqual({ status: 401, body: { error: 'session_ended', reason: 'password' } });
  });
});
