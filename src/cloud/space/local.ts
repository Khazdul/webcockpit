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
//               device's settings is a seed (`syncMeta.settingsSeed`): no
//               item, changed or not, until the first full pull settles it
//               (`settleSettingsSeed`); a pulled item of this type replaces
//               it, over any change made before (the login gives the
//               account's settings).
//   scriptData  one row per script name (values normalised for JSON).
//   timers      one row per character (src/timers/archive.ts).
//   comm        one item per kept UTC day (`commDayKept`: the day's start is
//               within 8 days 6 hours), read through the Comm archive's
//               helpers and cached per day under (count, highest seq) for
//               every adapter on the connection; a day over
//               `COMM_PIECE_RAW` of JSON is split into `day`, `day.2` ….
//               A put adds the records the day lacks, a remove deletes the
//               records of the removed pieces as listed; a put of a day
//               not kept is dropped.
//
// The looks (stage 80, ADR 0172):
//
//   lookImage   one row per own image (store `lookImages`, keyPath `id`),
//               the item's body as it is (`lookImageFields`).
//   looks       the one record under `looks` (src/looks/store.ts), an item
//               once it has a name. A put is merged into what is stored
//               (`mergeLooks`: per name the newest `at`), so a choice made
//               since the scan is kept and pushed next.
//
// The last-writer kinds settings and scriptData skip a put or remove over
// a value changed since the engine's scan (`list(kind, {scan})`): the
// player's change is then pushed at the next round.
//
// The run kinds (stage 63 C1, ADR 0153; `MemoryRunSpace` of
// tests/unit/cloud-sync-model.ts is the reference):
//
//   run         a saved run here is an item once its `runCloud` row is `up`
//               (its body is in the cloud), and, whatever its row's state,
//               while the account has its item (an agreed record: put back
//               in the queue after an edit beat a delete or after its body
//               was found gone, and then perhaps refused for room, or
//               restored from a backup over a `remote` row): a run in the
//               account is never left out, or the engine would push its
//               delete; a `remote` or `fetching` row is an item with its
//               meta. The body is
//               `{runId, meta, size}` (meta by `runItemMeta`). A put of a
//               run here takes the item's meta (an `up` row its size; no
//               row: an `up` one); of a run not here, a `remote` row. A
//               remove deletes the run (meta, chunks, events), its row and
//               the export doc of the session it began.
//   exportDoc   the `exports` store; a doc is an item when its session's
//               first run is saved here or `remote`, or the account has it.
//
// `idbRunCloudStore` is the upload queue's `RunCloudStore` over the same
// database (src/cloud/runs/queue.ts).

import { DEVICE_TYPES, type DeviceType, type SyncKind } from '../../../shared/cloud/api.ts';
import { jsonSafe } from '../../core/canonical-json';
import { STORE, idbDone, idbRequest } from '../../core/db';
import { device } from '../../core/device';
import { CommArchive } from '../../gmcp/comm-archive';
import { COMM_LIST_MS, commDayKept, commFields, commIdentity, dayBounds, sortCommRecords, utcDay } from '../../gmcp/comm-records';
import { isUntouchedSeed } from '../../profiles/seeds';
import { parseHeader, withHeaderName } from '../../scripts/header';
import { SETTINGS_KEY } from '../../settings/store';
import { type TimersRecord, TimersArchive } from '../../timers/archive';
import { deviceType } from '../device-info';
import { COMM_DAY_PATTERN, ITEM_SPECS, itemHashes, lookImageFields, looksBody, runItemMeta } from '../sync/items';
import { LOOKS_KEY, mergeLooks, parseLooks } from '../../looks/store';
import type { Body, CommItem, CommPieceRecord, LocalBatch, LocalItem, LocalItems, RunItem, SettingsItem, SyncMeta, SyncRecord, SyncRecords } from '../sync/types';
import type { RunCloudRow, RunCloudStore, RunRows } from '../runs/types';
import type { RunChunk, RunMeta } from '../../capture/store';
import type { RunEventRecord } from '../../runs/store';
import { type ExportDoc, normalizeExportDoc } from '../../share/edits';

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

/** The hash a settings seed is kept as: `main` as this type's item. */
export async function settingsSeedHash(type: DeviceType, record: unknown): Promise<string> {
  return (await itemHashes(ITEM_SPECS.settings, { type, record } as unknown as Body)).hash;
}

/**
 * A Comm day's piece is split past this much canonical JSON (some 110 KB
 * of gzip): a merge of two versions of a piece stays far under the item's
 * 1 MB (ADR 0152; stage 62 review, F4).
 */
export const COMM_PIECE_RAW = 1024 * 1024;

export { COMM_LIST_MS, commDayKept } from '../../gmcp/comm-records';

/**
 * A day's sorted records as its pieces: `day` alone, or `day`, `day.2` …
 * when over `max` (newest in the last). Greedy from the first record, so
 * records added at the end change only the last piece. `first` is the
 * index of the first piece made (the tail of a day split before).
 */
export function commPieces(day: string, records: readonly CommPieceRecord[], max = COMM_PIECE_RAW, first = 0): CommItem[] {
  const out: CommItem[] = [];
  const name = (i: number): string => (i === 0 ? day : `${day}.${i + 1}`);
  let cur: CommPieceRecord[] = [];
  let size = 0;
  for (const r of records) {
    const n = JSON.stringify(r).length + 1;
    if (cur.length && size + n > max) {
      out.push({ day: name(first + out.length), records: cur });
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += n;
  }
  out.push({ day: name(first + out.length), records: cur });
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

/** The local keys of `kind` among `sync` rows whose record has an agreed base (rev > 0, a hash). */
export function agreedIn(rows: readonly { kind: string; rec?: SyncRecord }[], kind: SyncKind): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (r.kind === kind && r.rec?.key && r.rec.rev > 0 && r.rec.hash !== null) out.add(r.rec.key);
  return out;
}

/** The local keys whose sync record has an agreed base (rev > 0, a hash), by kind. */
async function agreedKeys(t: IDBTransaction, kind: SyncKind): Promise<Set<string>> {
  return agreedIn((await idbRequest(t.objectStore(STORE.sync).getAll())) as SyncRow[], kind);
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
  /**
   * The record that replaced a login's seed (F1 of the stage 62 review):
   * the settings store takes it over any change of its own not saved yet
   * (`SettingsStore.reload({ force, record })`).
   */
  seedRecord?: unknown;
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
  /** The clock of Comm's kept days (default `Date.now`). */
  now?: () => number;
  /** A Comm piece's most JSON (default `COMM_PIECE_RAW`; tests). */
  commPieceMax?: number;
  /** Lets the game run between Comm days read in a list (default `setTimeout(0)`). */
  yieldToGame?: () => Promise<void>;
  /** A run's server id (`opaqueId(idKey, "run", runId)`): needed to write pulled `run` items. */
  runServerId?: (runId: string) => Promise<string>;
}

const isDeviceType = (t: unknown): t is DeviceType => typeof t === 'string' && (DEVICE_TYPES as readonly string[]).includes(t);

/** A stored value's stamp: equal stamps, the same value (structured clone keeps key order). */
function stamp(v: unknown): string | null {
  if (v === undefined) return null;
  try {
    return JSON.stringify(v) ?? null;
  } catch {
    return '\u0000unstampable';
  }
}

/** A Comm day's pieces as listed, and the cache key they were made under. */
interface CommDayCache {
  key: string;
  count: number;
  maxSeq: number;
  pieces: LocalItem[];
}

/**
 * Comm's cache per database connection (stage 62 review, F8): every
 * adapter of the page on one space (the engine's, Log out's, the counts)
 * shares it, and with it the hashes of its unchanged pieces.
 */
const commCaches = new WeakMap<IDBDatabase, Map<string, CommDayCache>>();
function commCacheOf(db: IDBDatabase): Map<string, CommDayCache> {
  let m = commCaches.get(db);
  if (!m) commCaches.set(db, (m = new Map()));
  return m;
}

const isUtcDay = (day: string): boolean => {
  try {
    dayBounds(day);
    return true;
  } catch {
    return false;
  }
};

const pieceItems = (pieces: readonly CommItem[]): LocalItem[] => pieces.map((p) => ({ key: p.day, body: p as unknown as Body }));

/** `LocalItems` on a space's database: profiles, user scripts and the small kinds. */
export function idbLocalItems(open: OpenDb, hooks: LocalHooks = {}, o: LocalOptions = {}): LocalItems {
  const type = o.type ?? thisDeviceType();
  const now = o.now ?? Date.now;
  const pieceMax = o.commPieceMax ?? COMM_PIECE_RAW;
  const yieldToGame = o.yieldToGame ?? ((): Promise<void> => new Promise((r) => setTimeout(r, 0)));
  /**
   * What the engine's last scan saw of a last-writer kind, by store key
   * (`stamp`), until its write (F10): a put or remove over a stored value
   * that changed since is skipped, so a player's change made meanwhile is
   * pushed at the next round instead of being overwritten.
   */
  const scanned = new Map<SyncKind, Map<IDBValidKey, string | null>>();
  /** Comm: the pieces each day had at the last list (what a remove of a piece means). */
  const listedComm = new Map<string, LocalItem[]>();

  /** The stored value at `key` is what the last scan saw (true without a scan). */
  const unchanged = async (snap: Map<IDBValidKey, string | null> | undefined, os: IDBObjectStore, key: IDBValidKey): Promise<boolean> => {
    if (!snap) return true;
    return stamp(await idbRequest(os.get(key))) === (snap.get(key) ?? null);
  };

  /** A day's pieces: the cached ones, the cached ones with what was appended since, or read again. */
  const dayPieces = async (a: CommArchive, d: { day: string; count: number; maxSeq: number }, old: CommDayCache | undefined): Promise<LocalItem[]> => {
    const last = old?.pieces.at(-1)?.body as unknown as CommItem | undefined;
    if (old && last && d.count > old.count && d.maxSeq > old.maxSeq) {
      // Records only appended at the end (the game's): the earlier pieces stay as they are (and cached, their hashes too).
      const lastTs = last.records.at(-1)?.ts ?? -Infinity;
      const added = (await a.recordsAfter(old.maxSeq)).filter((r) => utcDay(r.ts) === d.day);
      if (old.count + added.length === d.count && added.every((r) => r.ts > lastTs)) {
        const tail = commPieces(d.day, sortCommRecords([...last.records, ...added]), pieceMax, old.pieces.length - 1);
        return [...old.pieces.slice(0, -1), ...pieceItems(tail)];
      }
    }
    return pieceItems(commPieces(d.day, await a.dayRecords(d.day, { all: true }), pieceMax));
  };

  const listSmall = async (kind: SyncKind, scan: boolean): Promise<LocalItem[]> => {
    if (kind === 'settings') {
      const t = await tx(open, [STORE.settings, STORE.syncMeta, STORE.sync], 'readonly');
      const done = idbDone(t);
      const os = t.objectStore(STORE.settings);
      const meta = t.objectStore(STORE.syncMeta);
      const [keys, values, seed, agreed] = await Promise.all([
        idbRequest(os.getAllKeys()),
        idbRequest(os.getAll()),
        idbRequest(meta.get(META.settingsSeed)),
        agreedKeys(t, 'settings'),
      ]);
      await done;
      const snap = new Map<IDBValidKey, string | null>();
      const out: LocalItem[] = [];
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        const v = values[i] as Record<string, unknown> | undefined;
        snap.set(k, stamp(v));
        if (k === SETTINGS_KEY) {
          if (!v || typeof v !== 'object') continue;
          // A login's copy is a seed until the first full pull settles it, changed or not (F1): it gives way to the account's.
          if (seed !== undefined && !agreed.has(type)) continue;
          const body: SettingsItem = { type, record: v as unknown as SettingsItem['record'] };
          out.push({ key: type, body: body as unknown as Body });
        } else if (typeof k === 'string' && k.startsWith('device:')) {
          const t2 = k.slice('device:'.length);
          if (!isDeviceType(t2) || t2 === type || !v || typeof v !== 'object' || !v.record) continue;
          const body: SettingsItem = { type: t2, record: v.record as SettingsItem['record'] };
          out.push({ key: t2, body: body as unknown as Body });
        }
      }
      if (scan) scanned.set(kind, snap);
      return out;
    }
    if (kind === 'scriptData') {
      const t = await tx(open, [STORE.scriptData], 'readonly');
      const done = idbDone(t);
      const rows = (await idbRequest(t.objectStore(STORE.scriptData).getAll())) as Record<string, unknown>[];
      await done;
      const snap = new Map<IDBValidKey, string | null>();
      const out: LocalItem[] = [];
      for (const r of rows) {
        if (!r || typeof r.name !== 'string') continue;
        snap.set(r.name, stamp(r));
        if (r.name !== '') out.push({ key: r.name, body: scriptDataBody(r) });
      }
      if (scan) scanned.set(kind, snap);
      return out;
    }
    if (kind === 'timers') {
      const recs = await new TimersArchive(await open()).list();
      return recs.filter((r) => r.character !== '').map((r): LocalItem => ({ key: r.character, body: r as unknown as Body }));
    }
    if (kind === 'lookImage') {
      const t = await tx(open, [STORE.lookImages], 'readonly');
      const done = idbDone(t);
      const rows = (await idbRequest(t.objectStore(STORE.lookImages).getAll())) as unknown[];
      await done;
      const out: LocalItem[] = [];
      for (const r of rows) {
        const it = lookImageFields(r);
        if (it) out.push({ key: it.id, body: it as unknown as Body });
      }
      return out;
    }
    if (kind === 'looks') {
      const t = await tx(open, [STORE.looks], 'readonly');
      const done = idbDone(t);
      const raw = await idbRequest(t.objectStore(STORE.looks).get(LOOKS_KEY));
      await done;
      if (raw === undefined) return [];
      const body = looksBody(raw);
      return Object.keys(body.names).length ? [{ key: LOOKS_KEY, body: body as unknown as Body }] : [];
    }
    if (kind === 'comm') {
      const db = await open();
      const cache = commCacheOf(db);
      const a = new CommArchive(db, { now });
      const at = now();
      const out: LocalItem[] = [];
      const seen = new Set<string>();
      for (const d of await a.commDays(at, at - COMM_LIST_MS)) {
        if (!commDayKept(d.day, at)) continue;
        seen.add(d.day);
        const ck = `${d.count}:${d.maxSeq}:${pieceMax}`;
        let c = cache.get(d.day);
        if (!c || c.key !== ck) {
          const pieces = await dayPieces(a, d, c && c.key.endsWith(`:${pieceMax}`) ? c : undefined);
          c = { key: ck, count: d.count, maxSeq: d.maxSeq, pieces };
          cache.set(d.day, c);
          await yieldToGame(); // a day read and split: the game's frames and keys before the next
        }
        listedComm.set(d.day, c.pieces);
        out.push(...c.pieces);
      }
      for (const day of [...cache.keys()]) if (!seen.has(day)) cache.delete(day);
      for (const day of [...listedComm.keys()]) if (!seen.has(day)) listedComm.delete(day);
      return out;
    }
    return [];
  };

  const writeSmall = async (kind: SyncKind, batch: LocalBatch): Promise<SettingsWritten | undefined> => {
    const snap = scanned.get(kind);
    scanned.delete(kind);
    if (kind === 'settings') {
      const t = await tx(open, [STORE.settings, STORE.syncMeta], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.settings);
      const seeded = (await idbRequest(t.objectStore(STORE.syncMeta).get(META.settingsSeed))) !== undefined;
      let mine: SettingsWritten | undefined;
      for (const key of batch.remove) {
        if (!isDeviceType(key)) continue;
        const sk = key === type ? SETTINGS_KEY : otherTypeKey(key);
        if (await unchanged(snap, os, sk)) os.delete(sk);
      }
      for (const b of batch.put) {
        const it = b as unknown as SettingsItem;
        if (!isDeviceType(it.type)) continue;
        if (it.type === type) {
          // The seed is replaced whatever happened to it (F1); else a change made since the scan wins (F10).
          if (!seeded && !(await unchanged(snap, os, SETTINGS_KEY))) continue;
          os.put(it.record, SETTINGS_KEY);
          mine = seeded ? { seedRecord: it.record } : {};
        } else if (await unchanged(snap, os, otherTypeKey(it.type))) {
          os.put({ type: it.type, record: it.record }, otherTypeKey(it.type));
        }
      }
      await done;
      return mine;
    }
    if (kind === 'scriptData') {
      const t = await tx(open, [STORE.scriptData], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.scriptData);
      for (const key of batch.remove) if (await unchanged(snap, os, key)) os.delete(key);
      for (const b of batch.put) {
        const r = scriptDataBody(b);
        if (await unchanged(snap, os, r.name as string)) os.put(r);
      }
      await done;
      return undefined;
    }
    if (kind === 'timers') {
      await new TimersArchive(await open()).write({ put: batch.put as unknown as TimersRecord[], remove: batch.remove });
      return undefined;
    }
    if (kind === 'lookImage') {
      const t = await tx(open, [STORE.lookImages], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.lookImages);
      for (const key of batch.remove) os.delete(key);
      for (const b of batch.put) {
        const it = lookImageFields(b);
        if (it) os.put(it);
      }
      await done;
      return undefined;
    }
    if (kind === 'looks') {
      const t = await tx(open, [STORE.looks], 'readwrite');
      const done = idbDone(t);
      const os = t.objectStore(STORE.looks);
      if (batch.remove.includes(LOOKS_KEY)) os.delete(LOOKS_KEY);
      const put = batch.put.find((b) => b !== undefined);
      if (put) {
        // Merged into what is stored now: a choice made since the scan stays (and is pushed at the next round).
        const cur = await idbRequest(os.get(LOOKS_KEY));
        os.put(looksBody(mergeLooks(parseLooks(cur), parseLooks(put))), LOOKS_KEY);
      }
      await done;
      return undefined;
    }
    if (kind === 'comm') {
      const db = await open();
      const a = new CommArchive(db, { now });
      const at = now();
      // The pieces of a day are resolved once for the whole batch (F3): what the last list gave, else a fresh read.
      const gone = new Map<string, Set<string>>();
      for (const key of batch.remove) {
        if (!COMM_DAY_PATTERN.test(key)) continue;
        const day = key.slice(0, 10);
        gone.set(day, (gone.get(day) ?? new Set()).add(key));
      }
      for (const [day, pieceKeys] of gone) {
        if (!isUtcDay(day)) continue;
        const pieces = listedComm.get(day) ?? pieceItems(commPieces(day, await a.dayRecords(day, { all: true }), pieceMax));
        const records = pieces.filter((p) => pieceKeys.has(p.key)).flatMap((p) => (p.body as unknown as CommItem).records);
        // Only the records the removed pieces held: a message the game wrote since stays (and is pushed next).
        if (records.length) await removeCommRecords(open, day, records);
        commCacheOf(db).delete(day);
        listedComm.delete(day);
      }
      const add: CommPieceRecord[] = [];
      for (const b of batch.put) {
        const it = b as unknown as CommItem;
        if (typeof it.day !== 'string' || !COMM_DAY_PATTERN.test(it.day) || !commDayKept(it.day, at)) continue;
        for (const r of it.records ?? []) add.push(r);
      }
      if (add.length) await a.addDayRecords(add, { since: at - COMM_LIST_MS });
      return undefined;
    }
    return undefined;
  };

  return {
    async list(kind, lo) {
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
      if (kind === 'run') return listRunItems(open);
      if (kind === 'exportDoc') return listExportDocItems(open);
      return listSmall(kind, !!lo?.scan);
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
      } else if (kind === 'run' || kind === 'exportDoc') {
        if (kind === 'run') await writeRunItems(open, batch, o.runServerId, now);
        else await writeExportDocItems(open, batch);
        hooks.written?.(kind);
        return;
      } else {
        const settings = await writeSmall(kind, batch);
        hooks.written?.(kind, undefined, settings);
        return;
      }
      hooks.written?.(kind, changes);
    },
  };
}

// ------------------------------------------------------------ runs (ADR 0153)

/** The keys of a run's chunks or events (keyPath `[runId, seq]`). */
export const runRange = (runId: string): IDBKeyRange => IDBKeyRange.bound([runId, 0], [runId, Infinity]);

/** The `run` items of a space (see the file header). */
async function listRunItems(open: OpenDb): Promise<LocalItem[]> {
  const t = await tx(open, [STORE.runs, STORE.runCloud, STORE.sync], 'readonly');
  const done = idbDone(t);
  const [rows, agreed] = await Promise.all([idbRequest(t.objectStore(STORE.runCloud).getAll()) as Promise<RunCloudRow[]>, agreedKeys(t, 'run')]);
  const runs = t.objectStore(STORE.runs);
  const metas = await Promise.all(rows.map((r) => idbRequest(runs.get(r.runId)) as Promise<RunMeta | undefined>));
  await done;
  const out: LocalItem[] = [];
  rows.forEach((row, i) => {
    const here = metas[i];
    let meta: RunMeta | null = null;
    if (here) {
      // Up, or in the account already (a re-upload that ended full or too large leaves it there).
      if (row.state === 'up' || agreed.has(row.runId)) meta = runItemMeta(here);
    } else if ((row.state === 'remote' || row.state === 'fetching') && row.meta) meta = runItemMeta(row.meta);
    if (!meta || meta.runId !== row.runId) return;
    const body: RunItem = { runId: row.runId, meta, size: row.size };
    out.push({ key: row.runId, body: body as unknown as Body });
  });
  return out;
}

/** Writes pulled `run` items and tombstones (see the file header). */
async function writeRunItems(open: OpenDb, batch: LocalBatch, serverIdOf: ((runId: string) => Promise<string>) | undefined, now: () => number): Promise<void> {
  const puts = batch.put.map((b) => b as unknown as RunItem).filter((it) => typeof it.runId === 'string' && it.meta);
  // Server ids first: an await of the crypto would end the transaction.
  const ids = new Map<string, string>();
  for (const it of puts) {
    if (!serverIdOf) throw new Error('run items need runServerId');
    ids.set(it.runId, await serverIdOf(it.runId));
  }
  const t = await tx(open, [STORE.runs, STORE.runChunks, STORE.runEvents, STORE.runCloud, STORE.exports], 'readwrite');
  const done = idbDone(t);
  const runs = t.objectStore(STORE.runs);
  const cloud = t.objectStore(STORE.runCloud);
  for (const id of batch.remove) {
    runs.delete(id);
    t.objectStore(STORE.runChunks).delete(runRange(id));
    t.objectStore(STORE.runEvents).delete(runRange(id));
    cloud.delete(id);
    // The doc of the session this run began (a session is deleted whole).
    t.objectStore(STORE.exports).delete(id);
  }
  const at = now();
  for (const it of puts) {
    const [here, row] = (await Promise.all([idbRequest(runs.get(it.runId)), idbRequest(cloud.get(it.runId))])) as [RunMeta | undefined, RunCloudRow | undefined];
    const serverId = ids.get(it.runId)!;
    if (here) {
      runs.put({ ...here, ...it.meta });
      // The item's size is the account's (a body sealed again elsewhere may differ).
      if (row?.state === 'up') cloud.put({ ...row, size: it.size });
      else if (!row) cloud.put({ runId: it.runId, state: 'up', serverId, size: it.size, tries: 0, at, startedUs: it.meta.startedUs } satisfies RunCloudRow);
    } else {
      const next: RunCloudRow = {
        ...(row ?? { tries: 0 }),
        runId: it.runId,
        state: row?.state === 'fetching' ? 'fetching' : 'remote',
        serverId,
        size: it.size,
        at,
        startedUs: it.meta.startedUs,
        meta: it.meta,
      };
      delete next.full;
      cloud.put(next);
    }
  }
  await done;
}

/** The `exportDoc` items of a space (see the file header). */
async function listExportDocItems(open: OpenDb): Promise<LocalItem[]> {
  const t = await tx(open, [STORE.exports, STORE.runs, STORE.runCloud, STORE.sync], 'readonly');
  const done = idbDone(t);
  const [docs, agreed] = await Promise.all([idbRequest(t.objectStore(STORE.exports).getAll()) as Promise<ExportDoc[]>, agreedKeys(t, 'exportDoc')]);
  const runs = t.objectStore(STORE.runs);
  const cloud = t.objectStore(STORE.runCloud);
  const firsts = await Promise.all(
    docs.map((d) =>
      typeof d?.sessionId === 'string'
        ? (Promise.all([idbRequest(runs.get(d.sessionId)), idbRequest(cloud.get(d.sessionId))]) as Promise<[RunMeta | undefined, RunCloudRow | undefined]>)
        : Promise.resolve([undefined, undefined] as [undefined, undefined]),
    ),
  );
  await done;
  const out: LocalItem[] = [];
  docs.forEach((raw, i) => {
    const doc = normalizeExportDoc(raw);
    if (!doc) return;
    const [run, row] = firsts[i]!;
    const inCloud = run ? run.saved === true : row?.state === 'remote' || row?.state === 'fetching';
    if (inCloud || agreed.has(doc.sessionId)) out.push({ key: doc.sessionId, body: doc as unknown as Body });
  });
  return out;
}

async function writeExportDocItems(open: OpenDb, batch: LocalBatch): Promise<void> {
  const t = await tx(open, [STORE.exports], 'readwrite');
  const done = idbDone(t);
  const os = t.objectStore(STORE.exports);
  for (const k of batch.remove) os.delete(k);
  for (const b of batch.put) {
    const doc = normalizeExportDoc(b);
    if (doc) os.put(doc);
  }
  await done;
}

/** The upload queue's `RunCloudStore` on a space's database (ADR 0153 B2). */
export function idbRunCloudStore(open: OpenDb): RunCloudStore {
  const one = async <T>(store: string, mode: IDBTransactionMode, fn: (os: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const t = await tx(open, [store], mode);
    const done = idbDone(t);
    const r = fn(t.objectStore(store));
    const v = r ? await idbRequest(r) : undefined;
    await done;
    return v;
  };
  return {
    async list() {
      return ((await one(STORE.runCloud, 'readonly', (os) => os.getAll())) ?? []) as RunCloudRow[];
    },
    async get(runId) {
      return (await one(STORE.runCloud, 'readonly', (os) => os.get(runId))) as RunCloudRow | undefined;
    },
    async put(row) {
      await one(STORE.runCloud, 'readwrite', (os) => void os.put(row));
    },
    async remove(runId) {
      await one(STORE.runCloud, 'readwrite', (os) => void os.delete(runId));
    },
    async rows(runId): Promise<RunRows | null> {
      const t = await tx(open, [STORE.runs, STORE.runChunks, STORE.runEvents], 'readonly');
      const done = idbDone(t);
      const [meta, chunks, events] = (await Promise.all([
        idbRequest(t.objectStore(STORE.runs).get(runId)),
        idbRequest(t.objectStore(STORE.runChunks).getAll(runRange(runId))),
        idbRequest(t.objectStore(STORE.runEvents).getAll(runRange(runId))),
      ])) as [RunMeta | undefined, RunChunk[], RunEventRecord[]];
      await done;
      return meta ? { meta, chunks, events } : null;
    },
    async putFetched(rows, row) {
      const t = await tx(open, [STORE.runs, STORE.runChunks, STORE.runEvents, STORE.runCloud], 'readwrite');
      const done = idbDone(t);
      const cloud = t.objectStore(STORE.runCloud);
      // A tombstone pulled meanwhile deleted the row: the run is not written.
      const cur = (await idbRequest(cloud.get(row.runId))) as RunCloudRow | undefined;
      if (cur) {
        t.objectStore(STORE.runs).put(rows.meta);
        for (const e of rows.events) t.objectStore(STORE.runEvents).put(e);
        for (const c of rows.chunks) t.objectStore(STORE.runChunks).put(c);
        cloud.put(row);
      }
      await done;
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
 * type's settings (the account has none), the seed mark goes and `main`
 * is an item, as it is now (a change made before included), pushed at the
 * next sync: returns true. With an agreed record (the account's settings
 * were taken), the mark goes and false. A record holding a pulled version
 * (in use during play) keeps the seed until it is taken.
 */
export async function settleSettingsSeed(open: OpenDb, type: DeviceType = thisDeviceType()): Promise<boolean> {
  if ((await readMeta(open, [META.settingsSeed]))[META.settingsSeed] === undefined) return false;
  const t = await tx(open, [STORE.sync], 'readonly');
  const done = idbDone(t);
  const rows = (await idbRequest(t.objectStore(STORE.sync).getAll())) as SyncRow[];
  await done;
  const rec = rows.find((r) => r.kind === 'settings' && r.rec?.key === type)?.rec;
  if (rec && !(rec.rev > 0 && rec.hash !== null)) return false;
  await writeMeta(open, { [META.settingsSeed]: undefined });
  return !rec;
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

/** Reads and writes one `syncMeta` entry in one transaction: `fn` gets its value (undefined when absent) and returns the new one (undefined deletes it). */
export async function updateMeta(open: OpenDb, key: string, fn: (cur: unknown) => unknown): Promise<void> {
  const t = await tx(open, [STORE.syncMeta], 'readwrite');
  const done = idbDone(t);
  const os = t.objectStore(STORE.syncMeta);
  const next = fn(await idbRequest(os.get(key)));
  if (next === undefined) os.delete(key);
  else os.put(next, key);
  await done;
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
