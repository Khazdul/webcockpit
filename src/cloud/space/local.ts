// The sync engine's local ports on IndexedDB (stage 61 part C, ADR 0151
// "What part C provides"): `LocalItems` over the profiles and the user
// scripts of a space's database, `SyncRecords` over its `sync` and
// `syncMeta` stores.
//
//   profiles   keyPath `name`; the item's key is the record's `id` (v9)
//   scripts    keyPath `id`
//   sync       keyPath ['kind', 'key']: a row is {kind, key: serverId, rec}
//              (the engine keys its records by server id; `rec.key`, the
//              local key, may be null for an item this client cannot read)
//   syncMeta   out-of-line keys: cursor, lastSynced, deviceLabel, account,
//              move (src/cloud/space/move.ts)
//
// A batch is ONE transaction and removes before it puts (two items that
// swap names never trip the unique key on the way). An untouched seed
// (`default`, `khazdul` as seeded, src/profiles/store.ts) is no item until
// it has a sync record: `list` leaves it out, and a pulled item with its
// name or id simply replaces it.

import type { SyncKind } from '../../../shared/cloud/api.ts';
import { STORE, idbDone, idbRequest } from '../../core/db';
import { isUntouchedSeed } from '../../profiles/seeds';
import { parseHeader, withHeaderName } from '../../scripts/header';
import type { Body, LocalItem, LocalItems, SyncMeta, SyncRecord, SyncRecords } from '../sync/types';

/** Opens the space's database (a cached connection; reopened when another tab's upgrade closed it). */
export type OpenDb = () => Promise<IDBDatabase>;

interface ProfileRow {
  id: string;
  name: string;
  text: string;
  created: number;
  modified: number;
}

interface ScriptRow {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  created: number;
  updated: number;
}

interface SyncRow {
  kind: SyncKind;
  /** The server id. */
  key: string;
  rec: SyncRecord;
}

/** The meta keys of `syncMeta`. */
export const META = {
  cursor: 'cursor',
  lastSynced: 'lastSynced',
  deviceLabel: 'deviceLabel',
  /** `{ name, nameKey }`: whose space this is (the name as the server spells it). */
  account: 'account',
  move: 'move',
} as const;

/** A transaction over `stores`, retried once on a closed connection. */
async function tx(open: OpenDb, stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
  const db = await open();
  try {
    return db.transaction(stores, mode);
  } catch {
    return (await open()).transaction(stores, mode);
  }
}

const profileBody = (r: ProfileRow): Body => ({ id: r.id, name: r.name, text: r.text, created: r.created, modified: r.modified });
const scriptBody = (r: ScriptRow): Body => ({ id: r.id, name: r.name, source: r.source, enabled: r.enabled, created: r.created, updated: r.updated });

/** The local keys that have a sync record, by kind. */
async function recordKeys(t: IDBTransaction, kind: SyncKind): Promise<Set<string>> {
  const rows = (await idbRequest(t.objectStore(STORE.sync).getAll())) as SyncRow[];
  const out = new Set<string>();
  for (const r of rows) if (r.kind === kind && r.rec?.key) out.add(r.rec.key);
  return out;
}

export interface LocalHooks {
  /** After a batch was written (the page's caches: the script library reloads). */
  written?(kind: SyncKind): void;
}

/** `LocalItems` on a space's database: profiles and user scripts. */
export function idbLocalItems(open: OpenDb, hooks: LocalHooks = {}): LocalItems {
  return {
    async list(kind) {
      if (kind === 'profile') {
        const t = await tx(open, [STORE.profiles, STORE.sync], 'readonly');
        const done = idbDone(t);
        const [rows, keys] = await Promise.all([idbRequest(t.objectStore(STORE.profiles).getAll()) as Promise<ProfileRow[]>, recordKeys(t, 'profile')]);
        await done;
        return rows
          .filter((r) => typeof r.id === 'string' && r.id !== '' && !(isUntouchedSeed(r) && !keys.has(r.id)))
          .map((r): LocalItem => ({ key: r.id, body: profileBody(r) }));
      }
      if (kind === 'script') {
        const t = await tx(open, [STORE.scripts], 'readonly');
        const done = idbDone(t);
        const rows = (await idbRequest(t.objectStore(STORE.scripts).getAll())) as ScriptRow[];
        await done;
        return rows.map((r): LocalItem => ({ key: r.id, body: scriptBody(r) }));
      }
      return [];
    },

    async write(kind, batch) {
      if (batch.put.length === 0 && batch.remove.length === 0) return;
      if (kind === 'profile') {
        const t = await tx(open, [STORE.profiles], 'readwrite');
        const done = idbDone(t);
        const os = t.objectStore(STORE.profiles);
        const rows = (await idbRequest(os.getAll())) as ProfileRow[];
        const byId = new Map(rows.map((r) => [r.id, r]));
        const gone = new Set<string>();
        for (const key of batch.remove) {
          const r = byId.get(key);
          if (r) gone.add(r.name);
        }
        for (const b of batch.put) {
          const r = byId.get(b.id as string);
          if (r && r.name !== b.name) gone.add(r.name);
        }
        for (const name of gone) os.delete(name);
        for (const b of batch.put) os.put(profileBody(b as unknown as ProfileRow));
        await done;
      } else if (kind === 'script') {
        const t = await tx(open, [STORE.scripts], 'readwrite');
        const done = idbDone(t);
        const os = t.objectStore(STORE.scripts);
        for (const key of batch.remove) os.delete(key);
        for (const b of batch.put) {
          const r = scriptBody(b as unknown as ScriptRow) as unknown as ScriptRow;
          // The header's `@name` follows a name the sync gave (keep both, a collision): the
          // library renames a script to its header's name when it is saved.
          const named = parseHeader(r.source).header.name;
          os.put(named && named !== r.name ? { ...r, source: withHeaderName(r.source, r.name) } : r);
        }
        await done;
      } else {
        return;
      }
      hooks.written?.(kind);
    },
  };
}

/** `SyncRecords` on a space's database. `deviceLabel` is the label to use when none is stored. */
export function idbSyncRecords(open: OpenDb, deviceLabel: () => string): SyncRecords {
  return {
    async list() {
      const t = await tx(open, [STORE.sync], 'readonly');
      const done = idbDone(t);
      const rows = (await idbRequest(t.objectStore(STORE.sync).getAll())) as SyncRow[];
      await done;
      return rows.map((r) => r.rec).filter((r): r is SyncRecord => !!r && typeof r.serverId === 'string');
    },
    async write(batch) {
      if (batch.put.length === 0 && batch.remove.length === 0) return;
      const t = await tx(open, [STORE.sync], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.sync);
      for (const r of batch.remove) os.delete([r.kind, r.serverId]);
      for (const rec of batch.put) os.put({ kind: rec.kind, key: rec.serverId, rec } satisfies SyncRow);
      await done;
    },
    async meta(): Promise<SyncMeta> {
      const m = await readMeta(open, [META.cursor, META.lastSynced, META.deviceLabel]);
      const cursor = m[META.cursor];
      const last = m[META.lastSynced];
      const label = m[META.deviceLabel];
      return {
        cursor: typeof cursor === 'number' && cursor >= 0 ? cursor : 0,
        lastSynced: typeof last === 'number' ? last : null,
        deviceLabel: typeof label === 'string' && label !== '' ? label : deviceLabel(),
      };
    },
    async setMeta(patch) {
      const out: Record<string, unknown> = {};
      if (patch.cursor !== undefined) out[META.cursor] = patch.cursor;
      if (patch.lastSynced !== undefined) out[META.lastSynced] = patch.lastSynced;
      await writeMeta(open, out);
    },
  };
}

/** Reads `keys` of `syncMeta` (absent keys are left out). */
export async function readMeta(open: OpenDb, keys: readonly string[]): Promise<Record<string, unknown>> {
  const t = await tx(open, [STORE.syncMeta], 'readonly');
  const done = idbDone(t);
  const os = t.objectStore(STORE.syncMeta);
  const vals = await Promise.all(keys.map((k) => idbRequest(os.get(k))));
  await done;
  const out: Record<string, unknown> = {};
  keys.forEach((k, i) => {
    if (vals[i] !== undefined) out[k] = vals[i];
  });
  return out;
}

/** Writes `syncMeta` entries in one transaction; a value of undefined deletes its key. */
export async function writeMeta(open: OpenDb, entries: Record<string, unknown>): Promise<void> {
  const ks = Object.keys(entries);
  if (ks.length === 0) return;
  const t = await tx(open, [STORE.syncMeta], 'readwrite');
  const done = idbDone(t);
  const os = t.objectStore(STORE.syncMeta);
  for (const k of ks) {
    if (entries[k] === undefined) os.delete(k);
    else os.put(entries[k], k);
  }
  await done;
}
