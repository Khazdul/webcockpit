// The spaces' own work for the flows (stage 61 part C, ADR 0150, spec
// §7.4): making an account's space, what a space holds that is not in the
// account, handing an account's things back to the device, dropping a
// space. The flows (flows.ts) put these together; the runtime syncs.

import { NAME_PATTERN } from '../../../shared/cloud/api.ts';
import { STORE, idbDone, idbRequest, markDbGone, openDeviceDb, openWebcockpitDb, randomId } from '../../core/db';
import {
  ACCOUNT_SPACE_PREFIX,
  type SpaceRecord,
  currentSpace,
  deleteSpaceDb,
  isNameKey,
  lockedCopies,
  readSpaceRecord,
} from '../../core/space';
import { isUntouchedSeed } from '../../profiles/seeds';
import { SEEDED_META_KEY } from '../../profiles/seed-ids';
import { seedProfiles } from '../../profiles/store';
import { parseHeader, withHeaderName } from '../../scripts/header';
import { type KindSpec, PROFILE_NAMES, SCRIPT_NAMES, SYNC_SPECS, freeName } from '../sync/items';
import type { LocalItems, SyncRecord, SyncRecords, Unsynced } from '../sync/types';
import type { RunCloudRow } from '../runs/types';
import { listUnsynced } from '../sync/unsynced';
import { META, type OpenDb, type ProfileRow, type ScriptRow, agreedIn, idbLocalItems, idbSyncRecords, readMeta, runRange, settingsSeedHash, thisDeviceType, writeMeta } from './local';

/** An account's name key (the server's `name_key`). */
export const nameKeyOf = (name: string): string => name.toLowerCase();

const conns = new Map<string, Promise<IDBDatabase>>();
/** The spaces `prepareAccountSpace` is making now: the only ones an open may create (src/core/db.ts `mayCreate`). */
const preparing = new Set<string>();

/**
 * The database of an account's space, one cached connection per page
 * (reopened after a close). It is not made when it does not exist (but
 * while `prepareAccountSpace` makes it, or as the page's own space): the
 * open then fails (`NoSuchSpaceDb`).
 */
export function spaceDb(nameKey: string, factory: IDBFactory = globalThis.indexedDB): OpenDb {
  if (!isNameKey(nameKey)) throw new Error(`not an account name key: ${nameKey}`);
  return () => {
    let p = conns.get(nameKey);
    if (!p) {
      p = openWebcockpitDb(factory, ACCOUNT_SPACE_PREFIX + nameKey, { create: preparing.has(nameKey) });
      const drop = (): void => {
        if (conns.get(nameKey) === p) conns.delete(nameKey);
      };
      p.then((db) => {
        db.addEventListener('close', drop);
        db.addEventListener('versionchange', drop);
      }, drop);
      conns.set(nameKey, p);
    }
    return p;
  };
}

/** Closes this page's connection to an account's database (before it is deleted). */
export async function closeSpaceDb(nameKey: string): Promise<void> {
  const p = conns.get(nameKey);
  conns.delete(nameKey);
  if (p) (await p.catch(() => null))?.close();
}

let deviceConn: Promise<IDBDatabase> | null = null;

/** The device's database (whatever the current space), one cached connection. */
export const deviceDb: OpenDb = () => {
  if (!deviceConn) {
    const p = openDeviceDb();
    deviceConn = p;
    const drop = (): void => {
      if (deviceConn === p) deviceConn = null;
    };
    p.then((db) => {
      db.addEventListener('close', drop);
      db.addEventListener('versionchange', drop);
    }, drop);
  }
  return deviceConn;
};

/** Tests: forget the cached connections. */
export function resetSpaceConnsForTests(): void {
  conns.clear();
  deviceConn = null;
}

/** Deletes an account's database; gives up waiting after `ms` (a connection that never closes: the next login deletes it). */
export async function dropSpace(nameKey: string, ms = 4000): Promise<boolean> {
  // No store of this page makes it again (a late write after the delete).
  markDbGone(ACCOUNT_SPACE_PREFIX + nameKey);
  await closeSpaceDb(nameKey);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((r) => (timer = setTimeout(() => r(false), ms)));
  try {
    return await Promise.race([deleteSpaceDb(nameKey).then(() => true, () => false), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The record after an account's copy is gone: the other locked copies stay, the page is in the device's space. */
export function recordWithout(nameKey: string, rec: SpaceRecord | null = readSpaceRecord()): SpaceRecord | null {
  const rest = lockedCopies(rec).filter((k) => k !== nameKey);
  if (rest.length === 0) return null;
  return rest.length === 1 ? { nameKey: rest[0]!, state: 'locked' } : { nameKey: rest[0]!, state: 'locked', locked: rest.slice(1) };
}

/** The record that opens `nameKey`'s space; every other locked copy is kept. */
export function recordOpening(nameKey: string, rec: SpaceRecord | null = readSpaceRecord()): SpaceRecord {
  const rest = lockedCopies(rec).filter((k) => k !== nameKey);
  return rest.length ? { nameKey, state: 'open', locked: rest } : { nameKey, state: 'open' };
}

/** The current space's account name key, or null in the device's. */
export function currentNameKey(): string | null {
  const s = currentSpace();
  return s.kind === 'account' ? s.nameKey : null;
}

/** The account's name as the server spells it, from the space's `syncMeta` (nameKey when none is stored). */
export async function accountNameOf(nameKey: string): Promise<string> {
  try {
    const m = await readMeta(spaceDb(nameKey), [META.account]);
    const a = m[META.account] as { name?: unknown } | undefined;
    return typeof a?.name === 'string' && NAME_PATTERN.test(a.name) ? a.name : nameKey;
  } catch {
    return nameKey;
  }
}

/** What `prepareAccountSpace` copies from the device besides its settings. */
const COPIED = [STORE.scriptData, STORE.comm, STORE.timers] as const;

/**
 * Makes an account's space ready (ADR 0150): the database (`fresh`: a
 * stale one of that name is deleted first, a login never reuses one it
 * did not lock), the seeds as a new device gets them (only where the name
 * and the id are free; the `seeded` mark), the device's settings when the
 * space has none (spec §7.4, the one exception of a login), and in
 * `syncMeta` whose space it is and this device's label.
 *
 * ADR 0152: `copy` `'seed'` (a login, the default) marks the copied
 * settings as a seed (`settingsSeed`): the account's settings of this
 * device type win over it. `'all'` (Create account) copies the device's
 * script data, Comm history and timers too, and the settings are the
 * account's own (no seed): they are all pushed as its first items.
 */
export async function prepareAccountSpace(name: string, o: { fresh: boolean; deviceLabel: string; copy?: 'seed' | 'all' }): Promise<OpenDb> {
  const copy = o.copy ?? 'seed';
  const nameKey = nameKeyOf(name);
  if (o.fresh) await dropSpace(nameKey);
  const open = spaceDb(nameKey);
  let db: IDBDatabase;
  preparing.add(nameKey);
  try {
    await closeSpaceDb(nameKey); // a cached open that was refused (or of a deleted copy) is not reused
    db = await open();
  } finally {
    preparing.delete(nameKey);
  }
  // Settings from the device, read first (another database, another transaction).
  let settings: { keys: IDBValidKey[]; values: unknown[] } | null = null;
  const rows = new Map<string, unknown[]>();
  try {
    const dev = await openDeviceDb();
    const stores = copy === 'all' ? [STORE.settings, ...COPIED] : [STORE.settings];
    const t = dev.transaction(stores, 'readonly');
    const done = idbDone(t);
    const os = t.objectStore(STORE.settings);
    const [keys, values, ...more] = await Promise.all([
      idbRequest(os.getAllKeys()),
      idbRequest(os.getAll()),
      ...stores.slice(1).map((n) => idbRequest(t.objectStore(n).getAll()) as Promise<unknown[]>),
    ]);
    await done;
    settings = { keys, values };
    stores.slice(1).forEach((n, i) => rows.set(n, more[i] as unknown[]));
    dev.close();
  } catch {
    /* no settings to copy: the account's space starts with the defaults */
  }
  const main = settings?.keys.indexOf('main') ?? -1;
  const seed = copy === 'seed' && settings && main >= 0 ? await settingsSeedHash(thisDeviceType(), settings.values[main]).catch(() => null) : null;
  const t = db.transaction([STORE.profiles, STORE.settings, STORE.syncMeta, ...(copy === 'all' ? COPIED : [])], 'readwrite');
  const done = idbDone(t);
  const profiles = t.objectStore(STORE.profiles);
  const meta = t.objectStore(STORE.syncMeta);
  if ((await idbRequest(meta.get(SEEDED_META_KEY))) === undefined) {
    const have = (await idbRequest(profiles.getAll())) as ProfileRow[];
    const names = new Set(have.map((p) => p.name));
    const ids = new Set(have.map((p) => p.id));
    for (const seed of seedProfiles()) if (!names.has(seed.name) && !ids.has(seed.id)) profiles.put(seed);
    meta.put(true, SEEDED_META_KEY);
  }
  const st = t.objectStore(STORE.settings);
  if (settings && (await idbRequest(st.count())) === 0) {
    settings.keys.forEach((k, i) => st.put(settings!.values[i], k));
    if (seed) meta.put(seed, META.settingsSeed);
  }
  // Create account: the device's script data, Comm history and timers, as the account's own (the device keeps its).
  for (const [n, list] of rows) {
    const os = t.objectStore(n);
    if ((await idbRequest(os.count())) > 0) continue;
    for (const r of list) {
      if (n === STORE.comm) {
        const { seq: _seq, ...rest } = r as { seq?: number };
        os.add(rest);
      } else os.put(r);
    }
  }
  meta.put({ name, nameKey }, META.account);
  if ((await idbRequest(meta.get(META.deviceLabel))) === undefined) meta.put(o.deviceLabel, META.deviceLabel);
  await done;
  return open;
}

// ------------------------------------------------------------ what is not in the account

/**
 * The local changes not in the account, from the stores alone and without
 * the keys: the engine's `unsynced()` matched by local key instead of
 * server id (a lost session has no keys left). Same rules: new (no record
 * or rev 0), edited (hash differs), deleted (a live record without an item).
 */
export async function pendingChanges(local: LocalItems, records: SyncRecords, specs: readonly KindSpec[] = SYNC_SPECS): Promise<Unsynced[]> {
  return listUnsynced(specs, local, await records.list(), {
    item: async (_spec, key) => key,
    record: (rec) => rec.key,
  });
}

const DAY_US = 86_400_000_000;

/** The runs of a space a Log out would take from this device that are not in the account. */
export interface RunsLeft {
  /** Saved runs not in the cloud (ADR 0153): no `runCloud` row `up` with an agreed `run` record (every saved run with the flag `runs` off). */
  saved: number;
  /** Unsaved runs of the last 14 days (never in the cloud). */
  unsaved: number;
  /** Their ids, saved ones first (Log out's Download: the runs backup of exactly these). */
  savedIds: string[];
  unsavedIds: string[];
  /**
   * Why the saved ones are not in the cloud (stage 63 C2, Log out's second
   * line): `full` and `tooLarge` their `runCloud` state, `waiting` the rest
   * (queued, never queued, up without an agreed item). `cloud`: the space
   * has `runCloud` rows at all (runs in the cloud were on in it).
   */
  why: { full: number; tooLarge: number; waiting: number };
  cloud: boolean;
}

/**
 * The runs of a space not in the account: saved ones whose body and item
 * are not both up (queued, full, too large, or never queued), and unsaved
 * ones of the last 14 days. A saved run in the cloud is not counted.
 */
export async function runCounts(open: OpenDb, nowMs = Date.now()): Promise<RunsLeft> {
  const db = await open();
  const stores = [STORE.runs, STORE.runCloud, STORE.sync].filter((n) => db.objectStoreNames.contains(n));
  const t = db.transaction(stores, 'readonly');
  const done = idbDone(t);
  const has = (n: string): boolean => stores.includes(n as (typeof stores)[number]);
  const [runs, cloud, sync] = await Promise.all([
    idbRequest(t.objectStore(STORE.runs).getAll()) as Promise<{ runId: string; saved?: boolean; startedUs?: number }[]>,
    has(STORE.runCloud) ? (idbRequest(t.objectStore(STORE.runCloud).getAll()) as Promise<RunCloudRow[]>) : Promise.resolve([] as RunCloudRow[]),
    has(STORE.sync) ? (idbRequest(t.objectStore(STORE.sync).getAll()) as Promise<{ kind: string; rec?: SyncRecord }[]>) : Promise.resolve([]),
  ]);
  await done;
  const up = new Set(cloud.filter((r) => r.state === 'up').map((r) => r.runId));
  const state = new Map(cloud.map((r) => [r.runId, r.state]));
  const agreed = agreedIn(sync, 'run');
  const cutoff = nowMs * 1000 - 14 * DAY_US;
  const out: RunsLeft = { saved: 0, unsaved: 0, savedIds: [], unsavedIds: [], why: { full: 0, tooLarge: 0, waiting: 0 }, cloud: cloud.length > 0 };
  for (const r of runs) {
    if (r.saved) {
      if (up.has(r.runId) && agreed.has(r.runId)) continue;
      out.saved++;
      out.savedIds.push(r.runId);
      const st = state.get(r.runId);
      if (st === 'full') out.why.full++;
      else if (st === 'tooLarge') out.why.tooLarge++;
      else out.why.waiting++;
    } else if ((r.startedUs ?? 0) >= cutoff) {
      out.unsaved++;
      out.unsavedIds.push(r.runId);
    }
  }
  return out;
}

/** The kinds that keep a copy locked after a lost session: all but timers (ADR 0152: the game's state, stale within hours). */
export const LOCKING_SPECS: readonly KindSpec[] = SYNC_SPECS.filter((s) => s.kind !== 'timers');

/**
 * What a copy holds that is not in the account: the changes and the saved
 * runs not in the cloud (unsaved runs and timers do not count; spec §7.4,
 * ADR 0152, ADR 0153). The run kinds are not among the changes: a saved
 * run counts once, as a run, and an export doc edit alone does not lock.
 */
export async function notInAccount(nameKey: string, deviceLabel = 'device'): Promise<{ changes: Unsynced[]; savedRuns: number; runsCloud: boolean }> {
  const open = spaceDb(nameKey);
  const changes = await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => deviceLabel), LOCKING_SPECS);
  const { saved, cloud } = await runCounts(open);
  return { changes, savedRuns: saved, runsCloud: cloud };
}

// ------------------------------------------------------------ the device's own things

async function readThings(open: OpenDb): Promise<{ profiles: ProfileRow[]; scripts: ScriptRow[] }> {
  const db = await open();
  const t = db.transaction([STORE.profiles, STORE.scripts], 'readonly');
  const done = idbDone(t);
  const [profiles, scripts] = await Promise.all([
    idbRequest(t.objectStore(STORE.profiles).getAll()) as Promise<ProfileRow[]>,
    idbRequest(t.objectStore(STORE.scripts).getAll()) as Promise<ScriptRow[]>,
  ]);
  await done;
  return { profiles, scripts };
}

/** A space's own profiles and user scripts: everything but the untouched seeds (bundled scripts are not stored). */
export async function ownThings(open: OpenDb): Promise<{ profiles: ProfileRow[]; scripts: ScriptRow[] }> {
  const all = await readThings(open);
  return { profiles: all.profiles.filter((p) => !isUntouchedSeed(p)), scripts: all.scripts };
}

/**
 * A fingerprint of a thing as stored (id, name, body, times; FNV-1a in
 * two lanes): synchronous, so it is checked inside the transaction that
 * removes the thing (the move removes only what it copied).
 */
export function thingHash(row: ProfileRow | ScriptRow): string {
  const p = row as Partial<ProfileRow> & Partial<ScriptRow>;
  const s = JSON.stringify([row.id, row.name, p.text ?? null, p.source ?? null, p.enabled ?? null, p.modified ?? null, p.updated ?? null]);
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
}

/** What `writeThings` wrote, as written; `from`: the source's id of each thing written under a new id (key `<kind>:<new id>`). */
export interface Written {
  profiles: ProfileRow[];
  scripts: ScriptRow[];
  from: Map<string, string>;
}

/**
 * Writes `things` into the space of `open` as its own (the move and the
 * hand-back). With `keepIds` the ids are kept (the move: the account's
 * items are the device's things), and an untouched seed of the target
 * that has the id gives way (the device's `khazdul` renamed `conan` keeps
 * `seed-khazdul`; the new space's seed of it goes, so it is never pushed
 * over `conan`). Any other holder of the id, and every id without
 * `keepIds`, makes the thing take a new one: no two rows share an id. A
 * name the target already has keeps both, the new one named by the
 * engine's rule (`_2`); a thing identical to the one of its name is not
 * written again.
 */
export async function writeThings(
  open: OpenDb,
  things: { profiles: ProfileRow[]; scripts: ScriptRow[] },
  o: { keepIds: boolean; replaceSeeds?: boolean },
): Promise<Written> {
  const db = await open();
  const t = db.transaction([STORE.profiles, STORE.scripts], 'readwrite');
  const done = idbDone(t);
  const pOs = t.objectStore(STORE.profiles);
  const sOs = t.objectStore(STORE.scripts);
  const [haveP, haveS] = await Promise.all([idbRequest(pOs.getAll()) as Promise<ProfileRow[]>, idbRequest(sOs.getAll()) as Promise<ScriptRow[]>]);
  const out: Written = { profiles: [], scripts: [], from: new Map() };

  const pNames = new Map(haveP.map((p) => [p.name, p]));
  const pIds = new Map(haveP.map((p) => [p.id, p]));
  for (const p of things.profiles) {
    const same = pNames.get(p.name);
    let rec = { ...p };
    if (same) {
      if (same.text === p.text) continue;
      // The move: an untouched seed of the new space gives way to the device's changed one.
      if (o.replaceSeeds && isUntouchedSeed(same)) {
        pNames.delete(same.name);
        if (pIds.get(same.id) === same) pIds.delete(same.id);
      } else rec.name = freeName(p.name, new Set(pNames.keys()), PROFILE_NAMES);
    }
    const holder = pIds.get(rec.id);
    if (holder && o.keepIds && isUntouchedSeed(holder)) {
      pOs.delete(holder.name);
      pNames.delete(holder.name);
      pIds.delete(holder.id);
    } else if (holder) {
      rec = { ...rec, id: randomId() };
      out.from.set(`profile:${rec.id}`, p.id);
    }
    pOs.put(rec);
    pNames.set(rec.name, rec);
    pIds.set(rec.id, rec);
    out.profiles.push(rec);
  }

  const sNames = new Map(haveS.map((s) => [s.name, s]));
  const sIds = new Set(haveS.map((s) => s.id));
  for (const s of things.scripts) {
    const same = sNames.get(s.name);
    let rec = { ...s };
    if (same) {
      if (same.source === s.source) continue;
      const name = freeName(s.name, new Set(sNames.keys()), SCRIPT_NAMES);
      rec = { ...rec, name, source: parseHeader(rec.source).header.name ? withHeaderName(rec.source, name) : rec.source };
    }
    if (sIds.has(rec.id)) {
      rec = { ...rec, id: randomId() };
      out.from.set(`script:${rec.id}`, s.id);
    }
    sOs.put(rec);
    sNames.set(rec.name, rec);
    sIds.add(rec.id);
    out.scripts.push(rec);
  }
  await done;
  return out;
}

/** A thing to remove from a space if it is still as it was copied (`thingHash`). */
export interface RemoveEntry {
  kind: 'profile' | 'script';
  /** Its id in that space. */
  key: string;
  hash: string;
}

/**
 * Removes things from a space by id (the move's last step) where they
 * are still the same thing: one changed since it was copied (a guest game
 * in another tab typed into it) stays. Returns the entries left there.
 */
export async function removeThings(open: OpenDb, entries: readonly RemoveEntry[]): Promise<RemoveEntry[]> {
  const db = await open();
  const t = db.transaction([STORE.profiles, STORE.scripts], 'readwrite');
  const done = idbDone(t);
  const pOs = t.objectStore(STORE.profiles);
  const sOs = t.objectStore(STORE.scripts);
  const profiles = (await idbRequest(pOs.getAll())) as ProfileRow[];
  const kept: RemoveEntry[] = [];
  for (const e of entries) {
    const row = e.kind === 'profile' ? profiles.find((p) => p.id === e.key) : ((await idbRequest(sOs.get(e.key))) as ScriptRow | undefined);
    if (!row) continue;
    if (thingHash(row) !== e.hash) {
      kept.push(e);
      continue;
    }
    if (e.kind === 'profile') pOs.delete(row.name);
    else sOs.delete(e.key);
  }
  await done;
  return kept;
}

// ------------------------------------------------------------ the hand-back

interface RunRow {
  runId: string;
  character?: string;
  startedUs?: number;
}

/**
 * The account's runs (with their chunks and events) and export edits
 * become the device's, one transaction per run, so a hand-back cut off
 * anywhere goes on later without a copy twice: a run the device already
 * has (the same id, start and character) was handed back before and is
 * skipped; another run of that id (random ids: all but impossible) is
 * kept, and the account's gets a new id. An export edit the device has
 * for the same session is kept. Returns how many runs were written.
 */
export async function handBackRuns(from: OpenDb, to: OpenDb): Promise<number> {
  const src = await from();
  const dst = await to();
  const rt = src.transaction([STORE.runs, STORE.exports], 'readonly');
  const rdone = idbDone(rt);
  const [runs, exports] = await Promise.all([
    idbRequest(rt.objectStore(STORE.runs).getAll()) as Promise<RunRow[]>,
    idbRequest(rt.objectStore(STORE.exports).getAll()) as Promise<{ sessionId: string }[]>,
  ]);
  await rdone;
  const remap = new Map<string, string>();
  let n = 0;
  for (const run of runs) {
    const ct = src.transaction([STORE.runChunks, STORE.runEvents], 'readonly');
    const cdone = idbDone(ct);
    const [chunks, events] = await Promise.all([
      idbRequest(ct.objectStore(STORE.runChunks).getAll(runRange(run.runId))) as Promise<{ runId: string }[]>,
      idbRequest(ct.objectStore(STORE.runEvents).getAll(runRange(run.runId))) as Promise<{ runId: string }[]>,
    ]);
    await cdone;
    const wt = dst.transaction([STORE.runs, STORE.runChunks, STORE.runEvents], 'readwrite');
    const wdone = idbDone(wt);
    const os = wt.objectStore(STORE.runs);
    const there = (await idbRequest(os.get(run.runId))) as RunRow | undefined;
    if (there && there.startedUs === run.startedUs && there.character === run.character) {
      await wdone;
      continue;
    }
    const id = there ? randomId() : run.runId;
    if (id !== run.runId) remap.set(run.runId, id);
    os.put({ ...run, runId: id });
    for (const c of chunks) wt.objectStore(STORE.runChunks).put({ ...c, runId: id });
    for (const e of events) wt.objectStore(STORE.runEvents).put({ ...e, runId: id });
    await wdone;
    n++;
  }
  if (exports.length) {
    const et = dst.transaction(STORE.exports, 'readwrite');
    const edone = idbDone(et);
    const os = et.objectStore(STORE.exports);
    for (const x of exports) {
      const sessionId = remap.get(x.sessionId) ?? x.sessionId;
      if ((await idbRequest(os.getKey(sessionId))) === undefined) os.put({ ...x, sessionId });
    }
    await edone;
  }
  return n;
}

/**
 * Hand-back (Delete account): the account's profiles, scripts and runs
 * become the device's own (a name on both sides keeps both). Its
 * `scriptData`, settings, Comm and timers are not handed back: the device
 * keeps its own. Safe to run again after a cut: a profile or script
 * already handed back is identical to the one of its name, a run is
 * skipped.
 */
export async function handBack(nameKey: string): Promise<{ profiles: number; scripts: number; runs: number }> {
  const open = spaceDb(nameKey);
  const mine = await ownThings(open);
  const written = await writeThings(deviceDb, mine, { keepIds: false });
  const runs = await handBackRuns(open, deviceDb);
  return { profiles: written.profiles.length, scripts: written.scripts.length, runs };
}
