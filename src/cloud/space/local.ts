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
// it has an agreed base (a sync record with rev > 0 and a hash): `list`
// leaves it out, and a pulled item with its id simply replaces it (a
// record pulled but not yet agreed on, rev 0, does not make it an item:
// on a second device the seed would otherwise be a keep-both copy).
// Two rows with one id are refused (`list` throws): one would be pushed
// over the other. The seeding and the move never write such a pair.
//
// The small kinds (stage 62 C1, ADR 0152):
//
//   settings    `main` is this device type's item (`from`: syncMeta's
//               deviceLabel); `device:<type>` holds the other types' items
//               as pulled ({type, record, from}). A login's copy of the
//               device's settings is a seed (`syncMeta.settingsSeed`, its
//               hash): no item while it is unchanged and has no agreed
//               record (`settleSettingsSeed` ends it after a full sync).
//   scriptData  one row per script name.
//   timers      one row per character.
//   comm        one item per kept UTC day (`commDayKept`: the day's start is
//               within seven days), read through the Comm archive's helpers
//               and cached per day under (count, highest seq); a day over
//               `COMM_PIECE_RAW` of JSON is split into `day`, `day.2` ….
//               A put adds the records the day lacks, a remove deletes the
//               day (or a split piece's records); a put of a day not kept
//               is dropped.

import { DEVICE_TYPES, type DeviceType, type SyncKind } from '../../../shared/cloud/api.ts';
import { jsonSafe } from '../../core/canonical-json';
import { STORE, idbDone, idbRequest } from '../../core/db';
import { device } from '../../core/device';
import { CommArchive, commFields, commIdentity, dayBounds } from '../../gmcp/comm-archive';
import { isUntouchedSeed } from '../../profiles/seeds';
import { parseHeader, withHeaderName } from '../../scripts/header';
import { SETTINGS_KEY } from '../../settings/store';
import { deviceType } from '../device-info';
import { COMM_DAY_PATTERN, ITEM_SPECS, itemHashes } from '../sync/items';
import type { Body, CommItem, CommPieceRecord, LocalItem, LocalItems, SettingsItem, SyncMeta, SyncRecord, SyncRecords } from '../sync/types';

/** Opens the space's database (a cached connection; reopened when another tab's upgrade closed it). */
export type OpenDb = () => Promise<IDBDatabase>;

/** A row of the `profiles` store. */
export interface ProfileRow {
  id: string;
  name: string;
  text: string;
  created: number;
  modified: number;
}

/** A row of the `scripts` store (user scripts). */
export interface ScriptRow {
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
  /** The seeds were put in this database once (src/profiles/seed-ids.ts). */
  seeded: 'seeded',
  /** The hash of the device's settings as a login copied them (a seed, ADR 0152 "The first copy"). */
  settingsSeed: 'settingsSeed',
} as const;

/** This device's type (the settings item `main` stands for). */
export const thisDeviceType = (): DeviceType => deviceType(device());

/** The `settings` store's key of another device type's item. */
export const otherTypeKey = (t: DeviceType): string => `device:${t}`;

/** The hash a settings seed is kept as: `main` as this type's item (`from` is not hashed). */
export async function settingsSeedHash(type: DeviceType, record: unknown): Promise<string> {
  return (await itemHashes(ITEM_SPECS.settings, { type, record } as unknown as Body)).hash;
}

/** A Comm day's piece larger than this (canonical JSON, about 450 KB of gzip) is split (ADR 0152, 1 MB per item). */
export const COMM_PIECE_RAW = 4 * 1024 * 1024;

/** The kept days' check (ADR 0152 as built, `commDayKept` of the model): the day's start is within seven days. */
const KEEP_MS = 7 * 24 * 3600_000;
export function commDayKept(day: string, now: number): boolean {
  return Date.parse(`${day.slice(0, 10)}T00:00:00Z`) >= now - KEEP_MS;
}

/** A day's sorted records as its pieces: `day` alone, or `day`, `day.2` … when over `max` (newest in the last). */
export function commPieces(day: string, records: readonly CommPieceRecord[], max = COMM_PIECE_RAW): CommItem[] {
  const out: CommItem[] = [];
  let cur: CommPieceRecord[] = [];
  let size = 0;
  for (const r of records) {
    const n = JSON.stringify(r).length + 1;
    if (cur.length && size + n > max) {
      out.push({ day: out.length === 0 ? day : `${day}.${out.length + 1}`, records: cur });
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += n;
  }
  out.push({ day: out.length === 0 ? day : `${day}.${out.length + 1}`, records: cur });
  return out;
}

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

/** The local keys whose sync record has an agreed base (rev > 0, a hash), by kind. */
async function agreedKeys(t: IDBTransaction, kind: SyncKind): Promise<Set<string>> {
  const rows = (await idbRequest(t.objectStore(STORE.sync).getAll())) as SyncRow[];
  const out = new Set<string>();
  for (const r of rows) if (r.kind === kind && r.rec?.key && r.rec.rev > 0 && r.rec.hash !== null) out.add(r.rec.key);
  return out;
}

/** Two profile rows with one id: refused (one would be pushed over the other). */
export class DuplicateIdError extends Error {
  override name = 'DuplicateIdError';
}

/**
 * The profiles that are items: one row per id (an untouched seed that
 * shares its id with another row gives way to it); untouched seeds
 * without an agreed base left out. Throws `DuplicateIdError` for two
 * other rows with one id.
 */
export function profileItems(rows: readonly ProfileRow[], agreed: ReadonlySet<string>): ProfileRow[] {
  const byId = new Map<string, ProfileRow[]>();
  for (const r of rows) {
    if (typeof r.id !== 'string' || r.id === '') continue;
    const g = byId.get(r.id);
    if (g) g.push(r);
    else byId.set(r.id, [r]);
  }
  const out: ProfileRow[] = [];
  for (const [id, group] of byId) {
    const real = group.length > 1 ? group.filter((r) => !isUntouchedSeed(r)) : group;
    if (real.length > 1) throw new DuplicateIdError(`two profiles have the id ${id}: ${real.map((r) => r.name).join(', ')}`);
    const r = real[0];
    if (!r || (isUntouchedSeed(r) && !agreed.has(id))) continue;
    out.push(r);
  }
  return out;
}

/** What a batch of the sync changed in the profiles (for the page's caches and the selected profile). */
export interface ProfileChanges {
  /** Profiles written: their name and text now. */
  put: { id: string; name: string; text: string }[];
  /** Profiles that now have another name. */
  renamed: { id: string; from: string; to: string }[];
  /** Profiles removed. */
  removed: { id: string; name: string }[];
}

/** What a batch of the sync wrote into this device type's settings (`main`). */
export interface SettingsWritten {
  /** The writing device's sync label, when the item said. */
  from: string | null;
}

export interface LocalHooks {
  /**
   * After a batch was written (the page's caches: the script library
   * reloads, the profile listeners hear). `settings`: set when this device
   * type's settings were written.
   */
  written?(kind: SyncKind, profiles?: ProfileChanges, settings?: SettingsWritten): void;
}

export interface LocalOptions {
  /** This device's type (default `thisDeviceType()`). */
  type?: DeviceType;
  /** The clock of Comm's seven days (default `Date.now`). */
  now?: () => number;
}

const isDeviceType = (t: unknown): t is DeviceType => typeof t === 'string' && (DEVICE_TYPES as readonly string[]).includes(t);

/** The local keys of `kind` whose sync record has any base or remote (agreed or held). */
async function recordedKeys(t: IDBTransaction, kind: SyncKind): Promise<Set<string>> {
  const rows = (await idbRequest(t.objectStore(STORE.sync).getAll())) as SyncRow[];
  const out = new Set<string>();
  for (const r of rows) if (r.kind === kind && r.rec?.key) out.add(r.rec.key);
  return out;
}

/** `LocalItems` on a space's database: profiles, user scripts and the small kinds. */
export function idbLocalItems(open: OpenDb, hooks: LocalHooks = {}, o: LocalOptions = {}): LocalItems {
  const type = o.type ?? thisDeviceType();
  const now = o.now ?? Date.now;
  /** Comm: each day's pieces under its cache key (count, highest seq). */
  const commCache = new Map<string, { key: string; pieces: LocalItem[] }>();
  const archive = async (): Promise<CommArchive> => new CommArchive(await open(), { now });

  const listSmall = async (kind: SyncKind): Promise<LocalItem[]> => {
    if (kind === 'settings') {
      const t = await tx(open, [STORE.settings, STORE.syncMeta, STORE.sync], 'readonly');
      const done = idbDone(t);
      const os = t.objectStore(STORE.settings);
      const meta = t.objectStore(STORE.syncMeta);
      const [keys, values, label, seed, agreed] = await Promise.all([
        idbRequest(os.getAllKeys()),
        idbRequest(os.getAll()),
        idbRequest(meta.get(META.deviceLabel)),
        idbRequest(meta.get(META.settingsSeed)),
        agreedKeys(t, 'settings'),
      ]);
      await done;
      const out: LocalItem[] = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = values[i] as Record<string, unknown> | undefined;
        if (k === SETTINGS_KEY) {
          if (!v || typeof v !== 'object') continue;
          if (typeof seed === 'string' && !agreed.has(type) && (await settingsSeedHash(type, v)) === seed) continue;
          const body: SettingsItem = { type, record: v as unknown as SettingsItem['record'], ...(typeof label === 'string' && label ? { from: label } : {}) };
          out.push({ key: type, body: body as unknown as Body });
        } else if (typeof k === 'string' && k.startsWith('device:')) {
          const t2 = k.slice('device:'.length);
          if (!isDeviceType(t2) || t2 === type || !v || typeof v !== 'object' || !v.record) continue;
          const body: SettingsItem = { type: t2, record: v.record as SettingsItem['record'], ...(typeof v.from === 'string' ? { from: v.from } : {}) };
          out.push({ key: t2, body: body as unknown as Body });
        }
      }
      return out;
    }
    if (kind === 'scriptData') {
      const t = await tx(open, [STORE.scriptData], 'readonly');
      const done = idbDone(t);
      const rows = (await idbRequest(t.objectStore(STORE.scriptData).getAll())) as Record<string, unknown>[];
      await done;
      return rows
        .filter((r) => r && typeof r.name === 'string' && r.name !== '')
        .map((r): LocalItem => ({ key: r.name as string, body: scriptDataBody(r) }));
    }
    if (kind === 'timers') {
      const t = await tx(open, [STORE.timers], 'readonly');
      const done = idbDone(t);
      const rows = (await idbRequest(t.objectStore(STORE.timers).getAll())) as Record<string, unknown>[];
      await done;
      return rows
        .filter((r) => r && typeof r.character === 'string' && r.character !== '')
        .map((r): LocalItem => ({ key: r.character as string, body: { character: r.character, savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0, state: r.state ?? null } }));
    }
    if (kind === 'comm') {
      const a = await archive();
      const at = now();
      const out: LocalItem[] = [];
      const seen = new Set<string>();
      for (const d of await a.commDays(at)) {
        if (!commDayKept(d.day, at)) continue;
        seen.add(d.day);
        const ck = `${d.count}:${d.maxSeq}`;
        let c = commCache.get(d.day);
        if (!c || c.key !== ck) {
          const pieces = commPieces(d.day, await a.dayRecords(d.day));
          c = { key: ck, pieces: pieces.map((p) => ({ key: p.day, body: p as unknown as Body })) };
          commCache.set(d.day, c);
        }
        out.push(...c.pieces);
      }
      for (const day of [...commCache.keys()]) if (!seen.has(day)) commCache.delete(day);
      return out;
    }
    return [];
  };

  const writeSmall = async (kind: SyncKind, batch: { put: Body[]; remove: string[] }): Promise<SettingsWritten | undefined> => {
    if (kind === 'settings') {
      const t = await tx(open, [STORE.settings], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.settings);
      let mine: SettingsWritten | undefined;
      for (const key of batch.remove) {
        if (!isDeviceType(key)) continue;
        os.delete(key === type ? SETTINGS_KEY : otherTypeKey(key));
      }
      for (const b of batch.put) {
        const it = b as unknown as SettingsItem;
        if (!isDeviceType(it.type)) continue;
        if (it.type === type) {
          os.put(it.record, SETTINGS_KEY);
          mine = { from: typeof it.from === 'string' ? it.from : null };
        } else os.put({ type: it.type, record: it.record, ...(typeof it.from === 'string' ? { from: it.from } : {}) }, otherTypeKey(it.type));
      }
      await done;
      return mine;
    }
    if (kind === 'scriptData') {
      const t = await tx(open, [STORE.scriptData], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.scriptData);
      for (const key of batch.remove) os.delete(key);
      for (const b of batch.put) os.put(scriptDataBody(b));
      await done;
      return undefined;
    }
    if (kind === 'timers') {
      const t = await tx(open, [STORE.timers], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.timers);
      for (const key of batch.remove) os.delete(key);
      for (const b of batch.put) os.put({ character: b.character, savedAt: b.savedAt, state: b.state ?? null });
      await done;
      return undefined;
    }
    if (kind === 'comm') {
      const a = await archive();
      const at = now();
      for (const key of batch.remove) {
        if (!COMM_DAY_PATTERN.test(key)) continue;
        const day = key.slice(0, 10);
        const pieces = commCache.get(day)?.pieces ?? [];
        if (key === day && pieces.length <= 1) await a.removeDay(day);
        else {
          // One piece of a split day: only its records go.
          const piece = pieces.find((p) => p.key === key)?.body as unknown as CommItem | undefined;
          if (piece) await removeCommRecords(open, day, piece.records);
        }
        commCache.delete(day);
      }
      const add: CommPieceRecord[] = [];
      for (const b of batch.put) {
        const it = b as unknown as CommItem;
        if (typeof it.day !== 'string' || !COMM_DAY_PATTERN.test(it.day) || !commDayKept(it.day, at)) continue;
        for (const r of it.records ?? []) add.push(r);
      }
      if (add.length) await a.addDayRecords(add);
      return undefined;
    }
    return undefined;
  };

  return {
    async list(kind) {
      if (kind === 'profile') {
        const t = await tx(open, [STORE.profiles, STORE.sync], 'readonly');
        const done = idbDone(t);
        const [rows, keys] = await Promise.all([idbRequest(t.objectStore(STORE.profiles).getAll()) as Promise<ProfileRow[]>, agreedKeys(t, 'profile')]);
        await done;
        return profileItems(rows, keys).map((r): LocalItem => ({ key: r.id, body: profileBody(r) }));
      }
      if (kind === 'script') {
        const t = await tx(open, [STORE.scripts], 'readonly');
        const done = idbDone(t);
        const rows = (await idbRequest(t.objectStore(STORE.scripts).getAll())) as ScriptRow[];
        await done;
        return rows.map((r): LocalItem => ({ key: r.id, body: scriptBody(r) }));
      }
      return listSmall(kind);
    },

    async write(kind, batch) {
      if (batch.put.length === 0 && batch.remove.length === 0) return;
      let changes: ProfileChanges | undefined;
      if (kind === 'profile') {
        const t = await tx(open, [STORE.profiles], 'readwrite');
        const done = idbDone(t);
        const os = t.objectStore(STORE.profiles);
        const rows = (await idbRequest(os.getAll())) as ProfileRow[];
        // Every row of an id (an untouched seed that shared it with a moved thing, before stage 61's fixes).
        const byId = new Map<string, ProfileRow[]>();
        for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
        const gone = new Set<string>();
        changes = { put: [], renamed: [], removed: [] };
        for (const key of batch.remove) {
          for (const r of byId.get(key) ?? []) {
            gone.add(r.name);
            changes.removed.push({ id: r.id, name: r.name });
          }
        }
        for (const b of batch.put) {
          const p = profileBody(b as unknown as ProfileRow) as unknown as ProfileRow;
          for (const r of byId.get(p.id) ?? []) {
            if (r.name === p.name) continue;
            gone.add(r.name);
            changes.renamed.push({ id: p.id, from: r.name, to: p.name });
          }
          changes.put.push({ id: p.id, name: p.name, text: p.text });
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
        const settings = await writeSmall(kind, batch);
        hooks.written?.(kind, undefined, settings);
        return;
      }
      hooks.written?.(kind, changes);
    },
  };
}

/** A `scriptData` row as it is stored and travels. */
function scriptDataBody(r: Readonly<Record<string, unknown>>): Body {
  // Normalised for JSON (a number that is not finite, a hole in a Lua array: null), so an old stored value never breaks the sync.
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (jsonSafe(v) as Record<string, unknown>) : {});
  return { name: r.name, settings: obj(r.settings), store: obj(r.store), ...(typeof r.enabled === 'boolean' ? { enabled: r.enabled } : {}) };
}

/** Deletes the records of `day` whose identity is among `records` (a split day's piece). */
async function removeCommRecords(open: OpenDb, day: string, records: readonly CommPieceRecord[]): Promise<void> {
  const ids = new Set(records.map((r) => commIdentity(r)));
  const [start, end] = dayBounds(day);
  const t = await tx(open, [STORE.comm], 'readwrite');
  const done = idbDone(t);
  const req = t.objectStore(STORE.comm).index('ts').openCursor(IDBKeyRange.bound(start, end, false, true));
  req.onsuccess = () => {
    const c = req.result;
    if (!c) return;
    const f = commFields(c.value);
    if (f && ids.has(commIdentity(f))) c.delete();
    c.continue();
  };
  await done;
}

/**
 * The settings seed after a sync that finished (`synced`): the full pull
 * is done, so the copy gives way no longer. With no sync record of this
 * type's settings (the account has none), or an agreed one, the seed mark
 * goes and `main` is an item (pushed at the next sync); a record holding a
 * pulled version (in use during play) keeps it. Returns true when the
 * mark went and `main` is now an item to push.
 */
export async function settleSettingsSeed(open: OpenDb, type: DeviceType = thisDeviceType()): Promise<boolean> {
  const t = await tx(open, [STORE.syncMeta, STORE.sync], 'readonly');
  const done = idbDone(t);
  const [seed, recorded, agreed] = await Promise.all([idbRequest(t.objectStore(STORE.syncMeta).get(META.settingsSeed)), recordedKeys(t, 'settings'), agreedKeys(t, 'settings')]);
  await done;
  if (seed === undefined) return false;
  if (recorded.has(type) && !agreed.has(type)) return false;
  await writeMeta(open, { [META.settingsSeed]: undefined });
  return !recorded.has(type);
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
