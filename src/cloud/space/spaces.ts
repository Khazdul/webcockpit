// The spaces' own work for the flows (stage 61 part C, ADR 0150, spec
// §7.4): making an account's space, what a space holds that is not in the
// account, handing an account's things back to the device, dropping a
// space. The flows (flows.ts) put these together; the runtime syncs.

import { NAME_PATTERN } from '../../../shared/cloud/api.ts';
import { STORE, idbDone, idbRequest, openDeviceDb, openWebcockpitDb, randomId } from '../../core/db';
import {
  ACCOUNT_SPACE_PREFIX,
  type SpaceRecord,
  currentSpace,
  deleteSpaceDb,
  isNameKey,
  lockedCopies,
  readSpaceRecord,
} from '../../core/space';
import { isUntouchedSeed, seedProfiles } from '../../profiles/store';
import { parseHeader, withHeaderName } from '../../scripts/header';
import { PROFILE_NAMES, SCRIPT_NAMES, freeName, itemHashes, ITEM_SPECS } from '../sync/items';
import type { LocalItems, SyncRecords, Unsynced } from '../sync/types';
import { META, type OpenDb, idbLocalItems, idbSyncRecords, readMeta, writeMeta } from './local';

/** An account's name key (the server's `name_key`). */
export const nameKeyOf = (name: string): string => name.toLowerCase();

const conns = new Map<string, Promise<IDBDatabase>>();

/** The database of an account's space, one cached connection per page (reopened after a close). */
export function spaceDb(nameKey: string, factory: IDBFactory = globalThis.indexedDB): OpenDb {
  if (!isNameKey(nameKey)) throw new Error(`not an account name key: ${nameKey}`);
  return () => {
    let p = conns.get(nameKey);
    if (!p) {
      p = openWebcockpitDb(factory, ACCOUNT_SPACE_PREFIX + nameKey);
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

/**
 * Makes an account's space ready (ADR 0150): the database (`fresh`: a
 * stale one of that name is deleted first, a login never reuses one it
 * did not lock), the seeds as a new device gets them (only names that are
 * free), the device's settings when the space has none (spec §7.4, the
 * one exception of a login), and in `syncMeta` whose space it is and this
 * device's label.
 */
export async function prepareAccountSpace(name: string, o: { fresh: boolean; deviceLabel: string }): Promise<OpenDb> {
  const nameKey = nameKeyOf(name);
  if (o.fresh) await dropSpace(nameKey);
  const open = spaceDb(nameKey);
  const db = await open();
  // Settings from the device, read first (another database, another transaction).
  let settings: { keys: IDBValidKey[]; values: unknown[] } | null = null;
  try {
    const dev = await openDeviceDb();
    const t = dev.transaction(STORE.settings, 'readonly');
    const done = idbDone(t);
    const os = t.objectStore(STORE.settings);
    const [keys, values] = await Promise.all([idbRequest(os.getAllKeys()), idbRequest(os.getAll())]);
    await done;
    settings = { keys, values };
    dev.close();
  } catch {
    /* no settings to copy: the account's space starts with the defaults */
  }
  const t = db.transaction([STORE.profiles, STORE.settings, STORE.syncMeta], 'readwrite');
  const done = idbDone(t);
  const profiles = t.objectStore(STORE.profiles);
  const names = new Set((await idbRequest(profiles.getAllKeys())).map(String));
  for (const seed of seedProfiles()) if (!names.has(seed.name)) profiles.put(seed);
  const st = t.objectStore(STORE.settings);
  if (settings && (await idbRequest(st.count())) === 0) settings.keys.forEach((k, i) => st.put(settings!.values[i], k));
  const meta = t.objectStore(STORE.syncMeta);
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
export async function pendingChanges(local: LocalItems, records: SyncRecords): Promise<Unsynced[]> {
  const recs = await records.list();
  const out: Unsynced[] = [];
  for (const spec of [ITEM_SPECS.profile, ITEM_SPECS.script]) {
    const mine = recs.filter((r) => r.kind === spec.kind && r.key !== null);
    const byKey = new Map(mine.map((r) => [r.key!, r]));
    const seen = new Set<string>();
    for (const li of await local.list(spec.kind)) {
      seen.add(li.key);
      const rec = byKey.get(li.key);
      const name = spec.names?.get(li.body) ?? null;
      if (!rec || rec.rev === 0) out.push({ kind: spec.kind, key: li.key, name, change: 'new' });
      else if ((await itemHashes(spec, li.body)).hash !== rec.hash) out.push({ kind: spec.kind, key: li.key, name, change: 'edit' });
    }
    for (const rec of mine) {
      if (!seen.has(rec.key!) && rec.rev > 0 && rec.hash !== null) out.push({ kind: spec.kind, key: rec.key!, name: rec.name, change: 'delete' });
    }
  }
  return out;
}

const DAY_US = 86_400_000_000;

/** The runs of a space: saved ones (not in the cloud before stage 63) and unsaved ones of the last 14 days. */
export async function runCounts(open: OpenDb, nowMs = Date.now()): Promise<{ saved: number; unsaved: number }> {
  const db = await open();
  const t = db.transaction(STORE.runs, 'readonly');
  const done = idbDone(t);
  const runs = (await idbRequest(t.objectStore(STORE.runs).getAll())) as { saved?: boolean; startedUs?: number }[];
  await done;
  const cutoff = nowMs * 1000 - 14 * DAY_US;
  let saved = 0;
  let unsaved = 0;
  for (const r of runs) {
    if (r.saved) saved++;
    else if ((r.startedUs ?? 0) >= cutoff) unsaved++;
  }
  return { saved, unsaved };
}

/** What a copy holds that is not in the account: the changes and the saved runs (unsaved runs do not count; spec §7.4). */
export async function notInAccount(nameKey: string, deviceLabel = 'device'): Promise<{ changes: Unsynced[]; savedRuns: number }> {
  const open = spaceDb(nameKey);
  const changes = await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => deviceLabel));
  const { saved } = await runCounts(open);
  return { changes, savedRuns: saved };
}

// ------------------------------------------------------------ the device's own things

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
 * Writes `things` into the space of `open` as its own (the move and the
 * hand-back). With `keepIds` the ids are kept (the move: the account's
 * items are the device's things); otherwise an id the target already
 * has is replaced. A name the target already has keeps both, the new one
 * named by the engine's rule (`_2`); a thing identical to the one of its
 * name is not written again. Returns what was written (as written).
 */
export async function writeThings(
  open: OpenDb,
  things: { profiles: ProfileRow[]; scripts: ScriptRow[] },
  o: { keepIds: boolean; replaceSeeds?: boolean },
): Promise<{ profiles: ProfileRow[]; scripts: ScriptRow[] }> {
  const db = await open();
  const t = db.transaction([STORE.profiles, STORE.scripts], 'readwrite');
  const done = idbDone(t);
  const pOs = t.objectStore(STORE.profiles);
  const sOs = t.objectStore(STORE.scripts);
  const [haveP, haveS] = await Promise.all([idbRequest(pOs.getAll()) as Promise<ProfileRow[]>, idbRequest(sOs.getAll()) as Promise<ScriptRow[]>]);
  const out = { profiles: [] as ProfileRow[], scripts: [] as ScriptRow[] };

  const pNames = new Map(haveP.map((p) => [p.name, p]));
  const pIds = new Set(haveP.map((p) => p.id));
  for (const p of things.profiles) {
    const same = pNames.get(p.name);
    let rec = { ...p };
    if (same) {
      if (same.text === p.text) continue;
      // The move: an untouched seed of the new space gives way to the device's changed one.
      if (!(o.replaceSeeds && isUntouchedSeed(same))) rec.name = freeName(p.name, new Set(pNames.keys()), PROFILE_NAMES);
      else pIds.delete(same.id);
    }
    if (!o.keepIds && pIds.has(rec.id)) rec = { ...rec, id: randomId() };
    pOs.put(rec);
    pNames.set(rec.name, rec);
    pIds.add(rec.id);
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
    if (!o.keepIds && sIds.has(rec.id)) rec = { ...rec, id: randomId() };
    sOs.put(rec);
    sNames.set(rec.name, rec);
    sIds.add(rec.id);
    out.scripts.push(rec);
  }
  await done;
  return out;
}

/** Removes things from a space by id (the move's last step), where they are still the same thing. */
export async function removeThings(open: OpenDb, ids: { profiles: string[]; scripts: string[] }): Promise<void> {
  const db = await open();
  const t = db.transaction([STORE.profiles, STORE.scripts], 'readwrite');
  const done = idbDone(t);
  const pOs = t.objectStore(STORE.profiles);
  const want = new Set(ids.profiles);
  for (const p of (await idbRequest(pOs.getAll())) as ProfileRow[]) {
    if (want.has(p.id)) pOs.delete(p.name);
  }
  const sOs = t.objectStore(STORE.scripts);
  for (const id of ids.scripts) sOs.delete(id);
  await done;
}

/** Hand-back (Delete account): the account's profiles and scripts become the device's own (a name on both sides keeps both). */
export async function handBack(nameKey: string): Promise<{ profiles: number; scripts: number }> {
  const mine = await ownThings(spaceDb(nameKey));
  const written = await writeThings(deviceDb, mine, { keepIds: false });
  return { profiles: written.profiles.length, scripts: written.scripts.length };
}
