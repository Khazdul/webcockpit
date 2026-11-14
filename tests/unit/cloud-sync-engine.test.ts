// Stage 61 (spec §7.4 steps 2–7, ADR 0151): the sync engine, step by
// step, against the in-memory server model.
import { describe, expect, it } from 'vitest';
import { deriveKeys, makeRoot, seal, toBase64Url } from '../../src/cloud/crypto';
import { SyncEngine } from '../../src/cloud/sync/engine';
import { type KindSpec, profileSpec } from '../../src/cloud/sync/items';
import type { Body, Remote, SyncKeys, SyncStatus } from '../../src/cloud/sync/types';
import { Device, MemoryLocal, MemoryRecords, ServerModel, remoteFor, newLink } from './cloud-sync-model';

const NOV14 = new Date(2026, 10, 14, 12).getTime();

async function account(labels = ['desktop, Firefox', 'phone']) {
  const server = new ServerModel();
  const keys = await deriveKeys(makeRoot());
  const clock = { t: NOV14, now() { return this.t; } };
  const devices = labels.map((l) => new Device(server, keys, l, clock));
  return { server, keys, clock, devices };
}

let n = 0;
const prof = (name: string, text = `text of ${name}`, id = `p-${++n}`): Body => ({ id, name, text, created: 1, modified: 1 });
const scr = (name: string, source = `-- ${name}`, id = `s-${++n}`): Body => ({ id, name, source, enabled: false, created: 1, updated: 1 });

describe('push and pull', () => {
  it('a new item reaches another device; an edit and a rename follow it under the same server id', async () => {
    const { server, devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    a!.local.set('script', scr('healer'));
    expect(await a!.sync()).toEqual({ type: 'synced' });
    expect(server.usage().items).toBe(2);
    await b!.sync();
    expect(b!.names()).toEqual(['warrior']);
    expect(b!.names('script')).toEqual(['healer']);

    a!.local.set('profile', { ...p, name: 'fighter', text: 'new', modified: 2 });
    await a!.sync();
    await b!.sync();
    expect(b!.list()).toEqual([{ ...p, name: 'fighter', text: 'new', modified: 2 }]);
    expect(server.all().filter((x) => x.kind === 'profile')).toHaveLength(1);
    expect(server.all()[0]!.rev).toBe(2);
    expect(a!.events).toEqual([]);
    expect(b!.events).toEqual([]);
  });

  it('a delete reaches another device as a tombstone', async () => {
    const { server, devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    b!.local.del('profile', p.id as string);
    await b!.sync();
    expect(server.all()[0]).toMatchObject({ deleted: true, rev: 2 });
    await a!.sync();
    expect(a!.names()).toEqual([]);
    expect(a!.records.recs.size).toBe(0);
    expect(b!.records.recs.size).toBe(0);
  });

  it('pulls page by page and stores the cursor', async () => {
    const { server, keys, clock, devices: [a] } = await account(['desktop']);
    for (let i = 0; i < 7; i++) a!.local.set('profile', prof(`p${i}`));
    await a!.sync();
    const b = new Device(server, keys, 'phone', clock, { pageSize: 3 });
    const before = server.requests;
    await b.sync();
    expect(b.names()).toHaveLength(7);
    expect(server.requests - before).toBe(3);
    expect(b.records.m.cursor).toBe(7);
    expect(b.records.m.lastSynced).toBe(NOV14);
  });

  it('does nothing on a second sync, and ignores its own writes when they come back', async () => {
    const { server, devices: [a] } = await account(['desktop']);
    a!.local.set('profile', prof('warrior'));
    await a!.sync();
    const writes = a!.local.writes;
    const seq = server.seq;
    await a!.sync();
    expect(server.seq).toBe(seq);
    expect(a!.local.writes).toBe(writes);
    expect(a!.engine.status.get()).toMatchObject({ state: 'synced', waiting: 0, held: 0 });
  });

  it('identical edits on two devices are not a conflict', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    const edited = { ...p, text: 'same', modified: 5 };
    a!.local.set('profile', edited);
    b!.local.set('profile', edited);
    await a!.sync();
    await b!.sync();
    expect(b!.list()).toEqual([edited]);
    expect(b!.events).toEqual([]);
  });
});

describe('conflicts', () => {
  it('keep both: the server keeps the name, the local version becomes a copy pushed to all', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    a!.local.set('profile', { ...p, text: 'desktop edit', modified: 2 });
    b!.local.set('profile', { ...p, text: 'phone edit', modified: 3 });
    await a!.sync();
    await b!.sync();
    expect(b!.names()).toEqual(['warrior', 'warrior_from_phone_14Nov']);
    expect(b!.byName('warrior')).toMatchObject({ id: p.id, text: 'desktop edit' });
    const copy = b!.byName('warrior_from_phone_14Nov')!;
    expect(copy).toMatchObject({ text: 'phone edit', modified: 3, created: 1 });
    expect(copy.id).not.toBe(p.id);
    expect(b!.events).toEqual([{ type: 'keptBoth', kind: 'profile', key: p.id, name: 'warrior', copyKey: copy.id, copyName: 'warrior_from_phone_14Nov' }]);
    await a!.sync();
    expect(a!.list()).toEqual(b!.list());
  });

  it('keep both for scripts too', async () => {
    const { devices: [a, b] } = await account();
    const s = scr('healer');
    a!.local.set('script', s);
    await a!.sync();
    await b!.sync();
    a!.local.set('script', { ...s, enabled: true, updated: 2 });
    b!.local.set('script', { ...s, source: 'x', updated: 3 });
    await b!.sync();
    await a!.sync();
    expect(a!.names('script')).toEqual(['healer', 'healer_from_Firefox_14Nov']);
    expect(a!.byName('healer', 'script')).toMatchObject({ source: 'x', enabled: false });
  });

  it('an edit beats a delete: deleted here, edited there', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    a!.local.set('profile', { ...p, text: 'kept', modified: 2 });
    b!.local.del('profile', p.id as string);
    await a!.sync();
    await b!.sync();
    expect(b!.list()).toEqual([{ ...p, text: 'kept', modified: 2 }]);
    expect(b!.events).toEqual([{ type: 'restored', kind: 'profile', key: p.id, name: 'warrior' }]);
  });

  it('an edit beats a delete: edited here, deleted there (the tombstone is revived)', async () => {
    const { server, devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    b!.local.del('profile', p.id as string);
    await b!.sync();
    a!.local.set('profile', { ...p, text: 'kept', modified: 2 });
    await a!.sync();
    expect(server.all()[0]).toMatchObject({ deleted: false, rev: 3 });
    await b!.sync();
    expect(b!.list()).toEqual([{ ...p, text: 'kept', modified: 2 }]);
  });

  it('two new items with one name: the pulled one keeps it, the local one is renamed', async () => {
    const { devices: [a, b] } = await account();
    a!.local.set('profile', prof('warrior', 'a'));
    b!.local.set('profile', prof('warrior', 'b'));
    await a!.sync();
    await b!.sync();
    expect(b!.list().map((x) => [x.name, x.text])).toEqual([
      ['warrior', 'a'],
      ['warrior_2', 'b'],
    ]);
    expect(b!.events).toMatchObject([{ type: 'renamed', from: 'warrior', to: 'warrior_2' }]);
    await a!.sync();
    expect(a!.list()).toEqual(b!.list());
  });

  it('names swapped elsewhere arrive in one batch', async () => {
    const { devices: [a, b] } = await account();
    const x = prof('x');
    const y = prof('y');
    a!.local.set('profile', x);
    a!.local.set('profile', y);
    await a!.sync();
    await b!.sync();
    a!.local.del('profile', x.id as string);
    a!.local.set('profile', { ...y, name: 'x' });
    a!.local.set('profile', { ...x, name: 'y' });
    await a!.sync();
    await b!.sync();
    expect(b!.list().map((p) => [p.name, p.id])).toEqual([
      ['x', y.id],
      ['y', x.id],
    ]);
    expect(b!.events).toEqual([]);
  });

  it('last writer for a kind with that policy', async () => {
    const lw: KindSpec = { ...profileSpec, policy: 'lastWriter' };
    const server = new ServerModel();
    const keys = await deriveKeys(makeRoot());
    const clock = { now: () => NOV14 };
    const a = new Device(server, keys, 'desktop', clock, { specs: [lw] });
    const b = new Device(server, keys, 'phone', clock, { specs: [lw] });
    const p = prof('warrior');
    a.local.set('profile', p);
    await a.sync();
    await b.sync();
    a.local.set('profile', { ...p, text: 'a', modified: 2 });
    b.local.set('profile', { ...p, text: 'b', modified: 3 });
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.list()).toEqual([{ ...p, text: 'b', modified: 3 }]);
    expect(b.list()).toEqual(a.list());
  });
});

describe('in use during play', () => {
  it('a pulled change to an item in use waits; others apply at once', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    const q = prof('mage');
    a!.local.set('profile', p);
    a!.local.set('profile', q);
    await a!.sync();
    await b!.sync();
    b!.using.set('profile', new Set([p.id as string]));
    a!.local.set('profile', { ...p, text: 'new', modified: 2 });
    a!.local.set('profile', { ...q, text: 'new', modified: 2 });
    await a!.sync();
    await b!.sync();
    expect(b!.byName('warrior')!.text).toBe(p.text);
    expect(b!.byName('mage')!.text).toBe('new');
    expect(b!.engine.status.get()).toMatchObject({ state: 'synced', held: 1, waiting: 0 });
    await b!.sync();
    expect(b!.byName('warrior')!.text).toBe(p.text);
    b!.using.clear();
    await b!.sync();
    expect(b!.byName('warrior')!.text).toBe('new');
    expect(b!.engine.status.get()).toMatchObject({ held: 0 });
  });

  it('a delete of an item in use waits', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    b!.using.set('profile', new Set([p.id as string]));
    a!.local.del('profile', p.id as string);
    await a!.sync();
    await b!.sync();
    expect(b!.names()).toEqual(['warrior']);
    b!.using.clear();
    await b!.sync();
    expect(b!.names()).toEqual([]);
  });

  it('local edits in use are pushed; a conflict on one in use waits, then keeps both', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    a!.using.set('profile', new Set([p.id as string]));
    a!.local.set('profile', { ...p, text: 'played', modified: 2 });
    await a!.sync();
    await b!.sync();
    expect(b!.byName('warrior')!.text).toBe('played');

    b!.local.set('profile', { ...p, text: 'phone', modified: 3 });
    a!.local.set('profile', { ...p, text: 'played more', modified: 4 });
    await b!.sync();
    await a!.sync();
    expect(a!.names()).toEqual(['warrior']);
    expect(a!.engine.status.get()).toMatchObject({ held: 1, waiting: 1 });
    a!.using.clear();
    await a!.sync();
    expect(a!.names()).toEqual(['warrior', 'warrior_from_Firefox_14Nov']);
    expect(a!.byName('warrior')!.text).toBe('phone');
  });

  it('a pulled item does not take the name of an item in use', async () => {
    const { devices: [a, b] } = await account();
    a!.local.set('profile', prof('mage'));
    await a!.sync();
    await b!.sync();
    const p = prof('warrior', 'b');
    const m = a!.list()[0]!;
    a!.local.set('profile', { ...m, name: 'warrior' });
    // b makes its own warrior and starts playing it between a's pull and push.
    let once = true;
    a!.link.beforeWrite = async () => {
      if (!once) return;
      once = false;
      b!.local.set('profile', p);
      await b!.sync();
      b!.using.set('profile', new Set([p.id as string]));
    };
    await a!.sync();
    await b!.sync();
    expect(b!.list().map((x) => [x.name, x.id])).toEqual([
      ['warrior', p.id],
      ['warrior_2', m.id],
    ]);
  });
});

describe('the server says no', () => {
  it('409 from a write between pull and push: the next round resolves it', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    b!.local.set('profile', { ...p, text: 'b', modified: 3 });
    let once = true;
    a!.link.beforeWrite = async () => {
      if (!once) return;
      once = false;
      await b!.sync();
    };
    a!.local.set('profile', { ...p, text: 'a', modified: 2 });
    expect(await a!.sync()).toEqual({ type: 'synced' });
    expect(a!.names()).toEqual(['warrior', 'warrior_from_Firefox_14Nov']);
    expect(a!.byName('warrior')!.text).toBe('b');
  });

  it('three rounds of 409 back off', async () => {
    const { server, keys, clock } = await account([]);
    const local = new MemoryLocal();
    local.set('profile', prof('warrior'));
    const base = remoteFor(server, newLink());
    let rev = 0;
    const remote: Remote = {
      changes: (s, l) => base.changes(s, l),
      put: async (kind, id) => {
        rev++;
        return { status: 'conflict', current: { kind, id, rev, seq: rev, deleted: true, size: 0, updated: 0 } };
      },
      remove: base.remove,
    };
    const engine = new SyncEngine({ local, records: new MemoryRecords(), remote, keys, clock, random: () => 0.5 });
    expect(await engine.sync()).toEqual({ type: 'busy', retryAt: NOV14 + 5000 });
    expect(rev).toBe(3);
    expect(engine.status.get()).toMatchObject({ state: 'syncing', waiting: 1, retryAt: NOV14 + 5000 });
  });

  it('413: kept local, "full", retried and sent when there is room', async () => {
    const { server, devices: [a, b] } = await account();
    server.limits = { ...server.limits, items: 1 };
    a!.local.set('profile', prof('warrior'));
    a!.local.set('profile', prof('mage'));
    expect(await a!.sync()).toEqual({ type: 'synced' });
    expect(a!.engine.status.get()).toMatchObject({ state: 'full', full: 'too_many_items', waiting: 1 });
    expect(a!.events.filter((e) => e.type === 'full')).toHaveLength(1);
    expect(a!.names()).toEqual(['mage', 'warrior']);
    expect(await a!.engine.unsynced()).toHaveLength(1);
    await a!.sync();
    expect(a!.events.filter((e) => e.type === 'full')).toHaveLength(1);
    server.limits = { ...server.limits, items: 2000 };
    await a!.sync();
    expect(a!.engine.status.get()).toMatchObject({ state: 'synced', full: null, waiting: 0 });
    await b!.sync();
    expect(b!.names()).toEqual(['mage', 'warrior']);
  });

  it('offline and 5xx back off and recover', async () => {
    const { clock, devices: [a] } = await account(['desktop']);
    a!.local.set('profile', prof('warrior'));
    a!.link.online = false;
    expect(await a!.sync()).toEqual({ type: 'offline', retryAt: NOV14 + 5000 });
    expect(await a!.sync()).toEqual({ type: 'offline', retryAt: NOV14 + 15000 });
    expect(a!.engine.status.get()).toMatchObject({ state: 'offline', waiting: 0 });
    a!.link.online = true;
    a!.link.fail5xx = 1;
    expect(await a!.sync()).toEqual({ type: 'server', retryAt: NOV14 + 30000 });
    clock.t += 60_000;
    expect(await a!.sync()).toEqual({ type: 'synced' });
    expect(a!.engine.status.get()).toMatchObject({ state: 'synced', retryAt: null, lastSynced: NOV14 + 60_000 });
    a!.link.online = false;
    expect(await a!.sync()).toEqual({ type: 'offline', retryAt: clock.t + 5000 });
  });

  it('offline in the middle of the pushes keeps what was done', async () => {
    const { server, devices: [a, b] } = await account();
    for (let i = 0; i < 4; i++) a!.local.set('profile', prof(`p${i}`));
    let left = 2;
    a!.link.beforeWrite = async () => {
      if (left-- === 0) a!.link.online = false;
    };
    expect((await a!.sync()).type).toBe('offline');
    expect(server.usage().items).toBe(2);
    a!.link.online = true;
    a!.link.beforeWrite = undefined;
    await a!.sync();
    expect(server.usage().items).toBe(4);
    expect(server.seq).toBe(4);
    await b!.sync();
    expect(b!.names()).toHaveLength(4);
  });

  it('a session that ended is surfaced with its reason', async () => {
    const { server, devices: [a] } = await account(['desktop']);
    server.ended = 'recovered';
    expect(await a!.sync()).toEqual({ type: 'session_ended', reason: 'recovered' });
  });
});

describe('a newer client', () => {
  it('an item from a newer client is left untouched and asks for an update; an updated client reads it', async () => {
    const { server, keys, clock, devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    // A newer client writes v2 of the item.
    const sid = [...a!.records.recs.values()][0]!.serverId;
    const v2 = { ...p, text: 'from v2', modified: 9, colour: 'red', v: 2 };
    const blob = await seal(keys.dataKey, 'profile', sid, new TextEncoder().encode(JSON.stringify(v2)));
    expect(server.put('profile', sid, 1, blob).status).toBe(200);
    b!.local.set('profile', { ...p, text: 'phone edit', modified: 3 });
    await b!.sync();
    expect(b!.list()).toEqual([{ ...p, text: 'phone edit', modified: 3 }]);
    expect(b!.engine.status.get()).toMatchObject({ state: 'update', waiting: 1 });
    expect(b!.events).toEqual([{ type: 'newer', kind: 'profile', serverId: sid }]);
    expect(server.all()[0]!.rev).toBe(2);

    // The same device after an update to v2 (a spec that reads it).
    const v2spec: KindSpec = {
      ...profileSpec,
      version: 2,
      decode: (raw) => {
        const { v: _, ...rest } = raw as Record<string, unknown>;
        return { ok: true, body: rest };
      },
    };
    const updated = new SyncEngine({ local: b!.local, records: b!.records, remote: remoteFor(server, b!.link), keys, clock, specs: [v2spec] });
    await updated.sync();
    expect(b!.names()).toEqual(['warrior', 'warrior_from_phone_14Nov']);
    expect(b!.byName('warrior')).toMatchObject({ text: 'from v2', colour: 'red' });
    expect(updated.status.get().state).toBe('synced');
  });

  it('a blob that does not open is left untouched', async () => {
    const { server, devices: [a] } = await account(['desktop']);
    const sid = 'B'.repeat(22);
    expect(server.put('profile', sid, 0, new Uint8Array([1, ...new Uint8Array(40)])).status).toBe(200);
    await a!.sync();
    expect(a!.names()).toEqual([]);
    expect(a!.events).toEqual([{ type: 'unreadable', kind: 'profile', serverId: sid }]);
    expect(a!.engine.status.get().state).toBe('synced');
  });
});

describe('cut off and run again', () => {
  it('a keep-both cut off after the local batch makes no second copy', async () => {
    const { devices: [a, b] } = await account();
    const p = prof('warrior');
    a!.local.set('profile', p);
    await a!.sync();
    await b!.sync();
    a!.local.set('profile', { ...p, text: 'a', modified: 2 });
    b!.local.set('profile', { ...p, text: 'b', modified: 3 });
    await a!.sync();
    b!.records.failNext = true;
    await expect(b!.sync()).rejects.toThrow('records write failed');
    expect(b!.engine.status.get().state).toBe('offline');
    await b!.sync();
    await a!.sync();
    expect(b!.names()).toEqual(['warrior', 'warrior_from_phone_14Nov']);
    expect(a!.list()).toEqual(b!.list());
  });

  it('a local batch that fails changes nothing', async () => {
    const { devices: [a, b] } = await account();
    a!.local.set('profile', prof('warrior'));
    await a!.sync();
    b!.local.failNext = true;
    await expect(b!.sync()).rejects.toThrow('local write failed');
    await b!.sync();
    expect(b!.names()).toEqual(['warrior']);
  });
});

describe('the engine around a sync', () => {
  it('unsynced lists new, edited and deleted items without the network', async () => {
    const { devices: [a] } = await account(['desktop']);
    const p = prof('warrior');
    const q = prof('mage');
    a!.local.set('profile', p);
    a!.local.set('profile', q);
    await a!.sync();
    a!.local.set('profile', { ...p, text: 'x' });
    a!.local.del('profile', q.id as string);
    const s = scr('healer');
    a!.local.set('script', s);
    a!.link.online = false;
    expect(await a!.engine.unsynced()).toEqual([
      { kind: 'profile', key: p.id, name: 'warrior', change: 'edit' },
      { kind: 'profile', key: q.id, name: 'mage', change: 'delete' },
      { kind: 'script', key: s.id, name: 'healer', change: 'new' },
    ]);
  });

  it('a sync asked for while one runs runs once more', async () => {
    const { server, devices: [a] } = await account(['desktop']);
    a!.local.set('profile', prof('one'));
    const first = a!.sync();
    const second = a!.sync();
    a!.local.set('profile', prof('two'));
    await Promise.all([first, second]);
    expect(server.usage().items).toBe(2);
  });

  it('the status is observable', async () => {
    const { devices: [a] } = await account(['desktop']);
    const seen: SyncStatus['state'][] = [];
    const off = a!.engine.status.subscribe((s) => seen.push(s.state));
    a!.local.set('profile', prof('warrior'));
    await a!.sync();
    off();
    await a!.sync();
    expect(seen).toEqual(['syncing', 'synced']);
    expect(a!.engine.status.get()).toMatchObject({ usage: { items: 1 }, limits: { items: 2000 } });
  });

  it('runs under the lock', async () => {
    const server = new ServerModel();
    const keys: SyncKeys = await deriveKeys(makeRoot());
    const calls: string[] = [];
    const engine = new SyncEngine({
      local: new MemoryLocal(),
      records: new MemoryRecords(),
      remote: remoteFor(server, newLink()),
      keys,
      lock: {
        run: async (fn) => {
          calls.push('in');
          const r = await fn();
          calls.push('out');
          return r;
        },
      },
    });
    await engine.sync();
    expect(calls).toEqual(['in', 'out']);
  });

  it('blobs on the server are encrypted and bound to their ids', async () => {
    const { server, devices: [a] } = await account(['desktop']);
    a!.local.set('profile', prof('warrior', 'secret text'));
    await a!.sync();
    const item = server.all()[0]!;
    expect(item.blob).toBeDefined();
    expect(Buffer.from(item.blob!, 'base64url').toString('latin1')).not.toContain('secret');
    expect(item.blob).not.toBe(toBase64Url(new TextEncoder().encode('secret text')));
  });
});
