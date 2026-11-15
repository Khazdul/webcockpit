// Create account: the move (spec §7.4, ADR 0146 addendum; the owner's pick
// 1a and 1c). The device's own profiles and user scripts are copied, with
// their ids, into the new account's space; the list of what moved is kept
// in that space's `syncMeta` (`move`). After the change of space the sync
// pushes them, and each is removed from the device's database only once
// its sync record says the server has it (`synced`). A move cut off
// anywhere goes on at the next load: nothing is lost, nothing is copied
// twice (the copy keeps the ids, the sync keys items by id).
//
// Each entry keeps the fingerprint of the device's thing as it was copied
// (`thingHash`): a thing changed on the device after the copy (a guest
// game in another tab typed into it) is not removed. It stays on the
// device as the device's own, leaves the list and is not counted as moved
// (the account has the version that was copied).
//
// Untouched seeds and bundled scripts are not the device's own things and
// stay where they are.

import { DEVICE_SPACE } from '../../core/space';
import type { SyncOutcome } from '../sync/types';
import { META, type OpenDb, type ProfileRow, type ScriptRow, idbLocalItems, idbSyncRecords, readMeta, writeMeta } from './local';
import { notifyWritten } from './notify';
import { deviceDb, ownThings, prepareAccountSpace, removeThings, thingHash, writeThings } from './spaces';
import type { KindCounts } from './words';

export interface MoveEntry {
  kind: 'profile' | 'script';
  /** Its id in the account's space (the item's key). */
  key: string;
  name: string;
  /** Its id on the device when the copy got a new one (absent: the same). */
  deviceKey?: string;
  /** `thingHash` of the device's thing as it was copied (absent in a move begun before it was kept: removed as before). */
  hash?: string;
}

/** `syncMeta.move`. */
export interface MoveState {
  /** What was moved, by kind (for the lines afterwards); a thing kept on the device (changed there) is taken off. */
  total: KindCounts;
  /** What is still on the device, waiting for the server to have it. */
  left: MoveEntry[];
  /** Things changed on the device after the copy: left there, not counted as moved. */
  kept?: MoveEntry[];
  /** When the last thing left the device, or null. */
  doneAt: number | null;
}

export interface MoveProgress {
  total: KindCounts;
  /** Things that have left the device. */
  moved: number;
  /** What is still to move, by kind. */
  left: KindCounts;
  /** True when the last thing left the device in this call. */
  justDone: boolean;
  done: boolean;
}

const counts = (list: readonly MoveEntry[]): KindCounts => ({
  profiles: list.filter((e) => e.kind === 'profile').length,
  scripts: list.filter((e) => e.kind === 'script').length,
});

const sum = (c: KindCounts): number => c.profiles + c.scripts;

/**
 * The move's first half, in the device's space, right after the account
 * is made: the account's space prepared (fresh), the device's own things
 * copied into it, the list kept. Returns what moves.
 */
export async function beginMove(name: string, deviceLabel: string, now = Date.now()): Promise<{ open: OpenDb; total: KindCounts }> {
  const own = await ownThings(deviceDb);
  const open = await prepareAccountSpace(name, { fresh: true, deviceLabel });
  const written = await writeThings(open, own, { keepIds: true, replaceSeeds: true });
  const source = new Map<string, ProfileRow | ScriptRow>([...own.profiles.map((p) => [`profile:${p.id}`, p] as const), ...own.scripts.map((s) => [`script:${s.id}`, s] as const)]);
  const entry = (kind: 'profile' | 'script', id: string, nm: string): MoveEntry => {
    const from = written.from.get(`${kind}:${id}`) ?? id;
    const dev = source.get(`${kind}:${from}`);
    return { kind, key: id, name: nm, ...(from !== id ? { deviceKey: from } : {}), ...(dev ? { hash: thingHash(dev) } : {}) };
  };
  const left: MoveEntry[] = [
    ...written.profiles.map((p) => entry('profile', p.id, p.name)),
    ...written.scripts.map((s) => entry('script', s.id, s.name)),
  ];
  const total = counts(left);
  const state: MoveState = { total, left, doneAt: left.length === 0 ? now : null };
  await writeMeta(open, { [META.move]: state });
  return { open, total };
}

/** The move as it stands, or null when this space was not made by a move. */
export async function moveState(open: OpenDb): Promise<MoveState | null> {
  const m = (await readMeta(open, [META.move]))[META.move] as MoveState | undefined;
  return m && Array.isArray(m.left) && m.total ? m : null;
}

/**
 * The move's second half, after a sync, in the account's space: every
 * thing the server has now (its record `synced`, rev > 0, not a
 * tombstone) leaves the device's database, unless it was changed there
 * since the copy (then it stays, and is no longer counted as moved). A
 * thing the player deleted in the account before it was ever pushed (no
 * item, no record) is dropped from the list and stays on the device. Null
 * when there is no move.
 */
export async function continueMove(open: OpenDb, now = Date.now()): Promise<MoveProgress | null> {
  const m = await moveState(open);
  if (!m) return null;
  if (m.left.length === 0) return { total: m.total, moved: sum(m.total), left: { profiles: 0, scripts: 0 }, justDone: false, done: true };
  const recs = await idbSyncRecords(open, () => 'device').list();
  const local = idbLocalItems(open);
  const here = new Set([...(await local.list('profile')), ...(await local.list('script'))].map((i) => i.key));
  const synced = new Set(recs.filter((r) => r.key && r.state === 'synced' && r.rev > 0 && r.hash !== null).map((r) => `${r.kind}\n${r.key}`));
  const recorded = new Set(recs.filter((r) => r.key).map((r) => `${r.kind}\n${r.key}`));
  const gone: MoveEntry[] = [];
  const dropped: MoveEntry[] = [];
  for (const e of m.left) {
    const id = `${e.kind}\n${e.key}`;
    if (synced.has(id)) gone.push(e);
    else if (!here.has(e.key) && !recorded.has(id)) dropped.push(e);
  }
  let kept: MoveEntry[] = [];
  if (gone.length) {
    // An entry of a move begun before the fingerprint was kept matches its row whatever it holds.
    const sameAs = new Map<string, MoveEntry>();
    const want = await Promise.all(
      gone.map(async (e) => {
        const key = e.deviceKey ?? e.key;
        const r = { kind: e.kind, key, hash: e.hash ?? (await currentHash(e.kind, key)) };
        sameAs.set(`${e.kind}\n${key}`, e);
        return r;
      }),
    );
    kept = (await removeThings(deviceDb, want)).map((r) => sameAs.get(`${r.kind}\n${r.key}`)!);
    // The device's tabs (a guest game in another tab) follow.
    if (gone.some((e) => e.kind === 'profile')) notifyWritten(DEVICE_SPACE, { kind: 'profile' });
    if (gone.some((e) => e.kind === 'script')) notifyWritten(DEVICE_SPACE, { kind: 'script' });
  }
  const out = new Set([...gone, ...dropped]);
  const left = m.left.filter((e) => !out.has(e));
  const keptC = counts(kept);
  const total = { profiles: m.total.profiles - keptC.profiles, scripts: m.total.scripts - keptC.scripts };
  const justDone = left.length === 0;
  if (out.size) {
    const next: MoveState = { total, left, doneAt: justDone ? now : null, ...(m.kept || kept.length ? { kept: [...(m.kept ?? []), ...kept] } : {}) };
    await writeMeta(open, { [META.move]: next });
  }
  return { total, moved: sum(total) - left.length, left: counts(left), justDone, done: justDone };
}

/** The fingerprint of a device thing as it is now ('' when it is gone). */
async function currentHash(kind: 'profile' | 'script', key: string): Promise<string> {
  const own = await ownThings(deviceDb);
  const row = kind === 'profile' ? own.profiles.find((p) => p.id === key) : own.scripts.find((s) => s.id === key);
  return row ? thingHash(row) : '';
}

/** Whether a sync's outcome means the server could not be reached (the move then waits). */
export const unreachable = (o: SyncOutcome | null): boolean => !!o && (o.type === 'offline' || o.type === 'server');
