// Create account: the move (spec §7.4, ADR 0146 addendum; the owner's pick
// 1a and 1c). The device's own profiles and user scripts are copied, with
// their ids, into the new account's space; the list of what moved is kept
// in that space's `syncMeta` (`move`). After the change of space the sync
// pushes them, and each is removed from the device's database only once
// its sync record says the server has it (`synced`). A move cut off
// anywhere goes on at the next load: nothing is lost, nothing is copied
// twice (the copy keeps the ids, the sync keys items by id).
//
// Untouched seeds and bundled scripts are not the device's own things and
// stay where they are.

import type { SyncOutcome } from '../sync/types';
import { META, type OpenDb, idbLocalItems, idbSyncRecords, readMeta, writeMeta } from './local';
import { deviceDb, ownThings, prepareAccountSpace, removeThings, writeThings } from './spaces';
import type { KindCounts } from './words';

export interface MoveEntry {
  kind: 'profile' | 'script';
  key: string;
  name: string;
}

/** `syncMeta.move`. */
export interface MoveState {
  /** What was moved, by kind (for the lines afterwards). */
  total: KindCounts;
  /** What is still on the device, waiting for the server to have it. */
  left: MoveEntry[];
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
  await writeThings(open, own, { keepIds: true, replaceSeeds: true });
  const left: MoveEntry[] = [
    ...own.profiles.map((p): MoveEntry => ({ kind: 'profile', key: p.id, name: p.name })),
    ...own.scripts.map((s): MoveEntry => ({ kind: 'script', key: s.id, name: s.name })),
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
 * tombstone) leaves the device's database. A thing the player deleted in
 * the account before it was ever pushed (no item, no record) is dropped
 * from the list and stays on the device. Null when there is no move.
 */
export async function continueMove(open: OpenDb, now = Date.now()): Promise<MoveProgress | null> {
  const m = await moveState(open);
  if (!m) return null;
  const totalN = sum(m.total);
  if (m.left.length === 0) return { total: m.total, moved: totalN, left: { profiles: 0, scripts: 0 }, justDone: false, done: true };
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
  if (gone.length) {
    await removeThings(deviceDb, {
      profiles: gone.filter((e) => e.kind === 'profile').map((e) => e.key),
      scripts: gone.filter((e) => e.kind === 'script').map((e) => e.key),
    });
  }
  const out = new Set([...gone, ...dropped]);
  const left = m.left.filter((e) => !out.has(e));
  const justDone = left.length === 0;
  if (out.size) await writeMeta(open, { [META.move]: { ...m, left, doneAt: justDone ? now : null } satisfies MoveState });
  return { total: m.total, moved: totalN - left.length, left: counts(left), justDone, done: justDone };
}

/** Whether a sync's outcome means the server could not be reached (the move then waits). */
export const unreachable = (o: SyncOutcome | null): boolean => !!o && (o.type === 'offline' || o.type === 'server');
