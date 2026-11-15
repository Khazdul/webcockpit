// The flows that change space (stage 61 part C; spec §7.4, ADR 0146
// addendum, ADR 0150): into an account's space at Create account (the
// move), Log in and Recovery; out of it at Log out, a lost session and
// Delete account; the locked copy's notice and its Remove. Every change of
// space is `switchSpace`: the record, the start menu's message, a reload.
//
// The spaces are used when the flag `sync` is on (`spacesOn`); with it off
// the account pages are stage 60's (nothing moves, nobody changes space),
// except that a page already in an account's space still leaves it.

import type { SessionEndReason } from '../../../shared/cloud/api.ts';
import { NoSuchSpaceDb } from '../../core/db';
import { device } from '../../core/device';
import { DEVICE_SPACE, type SpaceRecord, currentSpace, isNameKey, lockedCopies, readSpaceRecord, switchSpace, writeSpaceRecord } from '../../core/space';
import { createAccountStore } from '../account/store';
import { noteLoggedOut } from '../account/state';
import { flagOn } from '../config';
import { browserFamily, deviceType } from '../device-info';
import { syncDeviceLabel } from '../sync/items';
import type { Unsynced } from '../sync/types';
import { type LockedNotice, isPlaying, patchSyncView } from '../sync-view';
import { META, writeMeta } from './local';
import { smallKindNames } from './unsynced-words';
import { beginMove } from './move';
import { notifyWritten } from './notify';
import {
  accountNameOf,
  closeSpaceDb,
  currentNameKey,
  dropSpace,
  handBack,
  nameKeyOf,
  notInAccount,
  prepareAccountSpace,
  recordOpening,
  recordWithout,
  spaceDb,
} from './spaces';
import { deletedElsewhereWords, deletedHereWords, handingBackWords, keptWords, lockedWords, lostWords, movingWords, unsyncedLines } from './words';

/** True when logging in changes space (the flag `sync`). */
export const spacesOn = (): Promise<boolean> => flagOn('sync');

/** This device in a keep-both name (`phone`, `tablet`, `desktop, Firefox`). */
export function thisDeviceLabel(): string {
  return syncDeviceLabel(deviceType(device()), browserFamily(globalThis.navigator?.userAgent ?? ''));
}

/** The page's sync, as the flows steer it (set by the runtime). */
export interface SyncControl {
  /** For good: the space goes. */
  stop(): void;
  /** For a while: a flow that may leave the space runs. */
  pause(): void;
  /** The flow did not leave (a failed Log out or Delete account): the sync goes on. */
  resume(): void;
}

const NO_CONTROL: SyncControl = { stop: () => {}, pause: () => {}, resume: () => {} };
let control: SyncControl = NO_CONTROL;
export function onSyncControl(c: SyncControl): void {
  control = c;
}
const stopSync = (): void => control.stop();

/**
 * A flow that leaves the space is running: the page's sync pauses, and a
 * lost session found meanwhile is that flow's (it says nothing of its
 * own). Set back to false when the flow failed: the sync goes on.
 */
let leaving = false;
export function setLeaving(on: boolean): void {
  const was = leaving;
  leaving = on;
  if (on) control.pause();
  else if (was) control.resume();
}

// ------------------------------------------------------------ in

/** localStorage: an account made here whose move has not started (its recovery code not confirmed before a reload). */
export const CREATED_KEY = 'wc.space.created';

/** Remembers an account just made here, until the move starts (`createAccountSpace`). */
export function noteCreated(name: string): void {
  try {
    globalThis.localStorage?.setItem(CREATED_KEY, nameKeyOf(name));
  } catch {
    /* storage blocked: a reload before the code is confirmed then logs in without the move */
  }
}

/** The account made here went to its Account page without a move (the flag `sync` off): nothing to move later. */
export function forgetCreated(): void {
  try {
    globalThis.localStorage?.removeItem(CREATED_KEY);
  } catch {
    /* nothing kept */
  }
}

/** True when the account made here (and not moved yet) is `nameKey`. The mark stays until the move has begun. */
function madeHere(nameKey: string): boolean {
  try {
    return globalThis.localStorage?.getItem(CREATED_KEY) === nameKey;
  } catch {
    return false;
  }
}

/**
 * Log in and Recovery: the account's space is made (a locked copy of the
 * same account is opened again instead: same database, synced on load),
 * nothing of the device's moves, and the page reloads into it. False when
 * the record could not be written (nothing changed).
 */
export async function enterAccount(name: string, message?: string): Promise<boolean> {
  const nameKey = nameKeyOf(name);
  const rec = readSpaceRecord();
  if (lockedCopies(rec).includes(nameKey)) {
    await writeMeta(spaceDb(nameKey), { [META.account]: { name, nameKey } });
  } else {
    await prepareAccountSpace(name, { fresh: true, deviceLabel: thisDeviceLabel() });
  }
  await closeSpaceDb(nameKey);
  return switchSpace(recordOpening(nameKey, rec), message);
}

/** Create account, after the recovery code is confirmed: the move, then the page reloads into the account's space. */
export async function createAccountSpace(name: string): Promise<boolean> {
  const nameKey = nameKeyOf(name);
  // The mark goes only once the move's state is stored: a move that fails before is begun again at the next load.
  const { total } = await beginMove(name, thisDeviceLabel());
  forgetCreated();
  await closeSpaceDb(nameKey);
  const n = total.profiles + total.scripts;
  return switchSpace(recordOpening(nameKey), n > 0 ? movingWords(name, 0, n) : undefined);
}

/**
 * At page load: the account hint and the space disagree (B1's note). Keys
 * stored while the page is in the device's space: a login (or an account
 * made here) whose change of space did not happen; it happens now.
 * Returns true when the page is about to reload.
 */
export async function reconcile(): Promise<boolean> {
  if (currentSpace().kind !== 'device') return false;
  let me: { name: string } | null = null;
  try {
    me = await createAccountStore().read();
  } catch {
    return false;
  }
  if (!me || !(await spacesOn())) return false;
  const nameKey = nameKeyOf(me.name);
  try {
    if (madeHere(nameKey)) return await createAccountSpace(me.name);
    return await enterAccount(me.name);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ out

/** Log out's last step (after the account's `logout()`): the account's copy goes, the page reloads into the device's space. */
export async function leaveAccount(message: string): Promise<boolean> {
  const nameKey = currentNameKey();
  if (!nameKey) return false;
  setLeaving(true);
  await dropSpace(nameKey);
  return switchSpace(recordWithout(nameKey), message);
}

/**
 * Delete account's last step (after the server deleted it): the account's
 * things become the device's, the copy goes. When the hand-back fails the
 * copy is kept, as a pending hand-back (`wc.space.handback`), never as a
 * locked copy (the account is dead: no Log in can open it): the page goes
 * to the device's space and the hand-back is tried again at every load
 * until it is done (`finishHandBacks`).
 */
export async function deleteHandBack(name: string): Promise<boolean> {
  const nameKey = currentNameKey();
  if (!nameKey) return false;
  setLeaving(true);
  stopSync();
  try {
    await handBack(nameKey);
  } catch {
    if (!addPendingHandBack(nameKey, name)) return false;
    await closeSpaceDb(nameKey);
    return switchSpace(recordWithout(nameKey), handingBackWords(name));
  }
  handedBack();
  await dropSpace(nameKey);
  return switchSpace(recordWithout(nameKey), deletedHereWords(name));
}

/** The device's other tabs follow a hand-back (their caches). */
function handedBack(): void {
  notifyWritten(DEVICE_SPACE, { kind: 'profile' });
  notifyWritten(DEVICE_SPACE, { kind: 'script' });
}

// ------------------------------------------------------------ a pending hand-back

/** localStorage: deleted accounts whose things are still to come back to the device: `[{nameKey, name}]`. */
export const HANDBACK_KEY = 'wc.space.handback';

export interface PendingHandBack {
  nameKey: string;
  name: string;
}

/** The pending hand-backs (empty when none or unreadable). */
export function pendingHandBacks(): PendingHandBack[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(HANDBACK_KEY) ?? '[]') as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is PendingHandBack => !!x && isNameKey((x as PendingHandBack).nameKey) && typeof (x as PendingHandBack).name === 'string');
  } catch {
    return [];
  }
}

function writePending(list: PendingHandBack[]): boolean {
  try {
    const s = globalThis.localStorage;
    if (!s) return false;
    if (list.length) s.setItem(HANDBACK_KEY, JSON.stringify(list));
    else s.removeItem(HANDBACK_KEY);
    return true;
  } catch {
    return false;
  }
}

function addPendingHandBack(nameKey: string, name: string): boolean {
  return writePending([...pendingHandBacks().filter((p) => p.nameKey !== nameKey), { nameKey, name }]);
}

/**
 * At load, in the device's space: every pending hand-back is tried again.
 * Done: the copy goes and the start menu says so; not yet: it says the
 * things are being moved back. Returns the messages for the start menu.
 */
export async function finishHandBacks(): Promise<string[]> {
  if (currentSpace().kind !== 'device') return [];
  const out: string[] = [];
  for (const p of pendingHandBacks()) {
    try {
      await handBack(p.nameKey);
    } catch (e) {
      await closeSpaceDb(p.nameKey);
      // The copy itself is gone (deleted by hand, or by the browser): nothing is left to hand back.
      if (e instanceof NoSuchSpaceDb) writePending(pendingHandBacks().filter((x) => x.nameKey !== p.nameKey));
      else out.push(handingBackWords(p.name));
      continue;
    }
    handedBack();
    await dropSpace(p.nameKey);
    writePending(pendingHandBacks().filter((x) => x.nameKey !== p.nameKey));
    out.push(deletedHereWords(p.name));
  }
  return out;
}

// ------------------------------------------------------------ a lost session

let lostWaiting: { reason: SessionEndReason | null } | null = null;
let handling = false;

/** The keys and the hint go (the session is gone); the copy is decided on by `sessionLost`. */
async function forgetKeys(deleted: boolean): Promise<void> {
  await createAccountStore().remove();
  noteLoggedOut({ forgetName: deleted });
}

/**
 * A lost session (`session_ended`, from the sync or any account call;
 * spec §7.4): a game in progress plays on (`sessionLostLater` runs when
 * the start page shows); on the start menu the copy is removed, or kept
 * locked when something in it is not in the account.
 */
export async function sessionLost(reason: SessionEndReason | null): Promise<void> {
  if (leaving || handling) return;
  if (isPlaying()) {
    lostWaiting = { reason };
    return;
  }
  const rec = readSpaceRecord();
  const nameKey = currentNameKey() ?? (rec?.state === 'open' ? rec.nameKey : null);
  handling = true;
  try {
    await forgetKeys(reason === 'deleted');
    if (!nameKey) return;
    stopSync();
    const name = await accountNameOf(nameKey);
    if (reason === 'deleted') {
      await dropSpace(nameKey);
      switchSpace(recordWithout(nameKey, rec), deletedElsewhereWords(name));
      return;
    }
    const kept = await notInAccount(nameKey).catch(() => null);
    if (kept && kept.changes.length === 0 && kept.savedRuns === 0) {
      await dropSpace(nameKey);
      switchSpace(recordWithout(nameKey, rec), lostWords(name));
      return;
    }
    // Something is not in the account (or it could not be told): kept, locked; unless a Log out (or
    // Delete account) of this account ran meanwhile, here or in another tab: the copy is gone, nothing to lock.
    await closeSpaceDb(nameKey);
    const now = readSpaceRecord();
    if (leaving || !(now?.state === 'open' && now.nameKey === nameKey)) return;
    const others = lockedCopies(rec).filter((k) => k !== nameKey);
    switchSpace(others.length ? { nameKey, state: 'locked', locked: others } : { nameKey, state: 'locked' });
  } finally {
    handling = false;
  }
}

/** The start page is shown again: a session lost during the game is decided on now. */
export async function sessionLostLater(): Promise<void> {
  const w = lostWaiting;
  lostWaiting = null;
  if (w) await sessionLost(w.reason);
}

// ------------------------------------------------------------ the locked copy

/** The locked copy's notice for the start menu (the device's space), or null. */
export async function lockedNotice(): Promise<LockedNotice | null> {
  if (currentSpace().kind !== 'device') return null;
  const nameKey = lockedCopies()[0];
  if (!nameKey) return null;
  const name = await accountNameOf(nameKey);
  const kept = await notInAccount(nameKey).catch(() => null);
  if (!kept) return { nameKey, name, what: 'Some changes', lost: [] };
  const what = keptWords(kept.changes.length, kept.savedRuns) || 'Nothing';
  const lost = [...unsyncedLines(kept.changes), ...smallKindNames(kept.changes, { timers: false }), ...(kept.savedRuns ? [`${kept.savedRuns} saved run${kept.savedRuns === 1 ? '' : 's'}`] : [])];
  return { nameKey, name, what, lost };
}


/** The notice's sentence. */
export const lockedText = (n: LockedNotice): string => lockedWords(n.name, n.what);

/** Remove (the locked copy's notice): the copy is deleted; the page stays in the device's space. */
export async function removeLocked(nameKey: string): Promise<void> {
  await dropSpace(nameKey);
  const next: SpaceRecord | null = recordWithout(nameKey);
  writeSpaceRecord(next);
  patchSyncView({ locked: await lockedNotice().catch(() => null) });
}
