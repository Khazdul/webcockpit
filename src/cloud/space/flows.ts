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
import { device } from '../../core/device';
import { type SpaceRecord, currentSpace, lockedCopies, readSpaceRecord, switchSpace, writeSpaceRecord } from '../../core/space';
import { createAccountStore } from '../account/store';
import { noteLoggedOut } from '../account/state';
import { flagOn } from '../config';
import { browserFamily, deviceType } from '../device-info';
import { syncDeviceLabel } from '../sync/items';
import { type LockedNotice, isPlaying, patchSyncView } from '../sync-view';
import { META, writeMeta } from './local';
import { beginMove } from './move';
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
import { deletedElsewhereWords, deletedHereWords, keptWords, lockedWords, lostWords, movingWords, unsyncedLines } from './words';

/** True when logging in changes space (the flag `sync`). */
export const spacesOn = (): Promise<boolean> => flagOn('sync');

/** This device in a keep-both name (`phone`, `tablet`, `desktop, Firefox`). */
export function thisDeviceLabel(): string {
  return syncDeviceLabel(deviceType(device()), browserFamily(globalThis.navigator?.userAgent ?? ''));
}

/** Stops the page's sync before a space goes (set by the runtime). */
let stopSync: () => void = () => {};
export function onStopSync(fn: () => void): void {
  stopSync = fn;
}

/** A flow that leaves the space is running: a lost session found meanwhile is that flow's (it says nothing of its own). */
let leaving = false;
export function setLeaving(on: boolean): void {
  leaving = on;
  if (on) stopSync();
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

function takeCreated(nameKey: string): boolean {
  try {
    const s = globalThis.localStorage;
    const v = s?.getItem(CREATED_KEY);
    s?.removeItem(CREATED_KEY);
    return v === nameKey;
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
  takeCreated(nameKey);
  const { total } = await beginMove(name, thisDeviceLabel());
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
    if (takeCreated(nameKey)) return await createAccountSpace(me.name);
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

/** Delete account's last step (after the server deleted it): the account's things become the device's, the copy goes. */
export async function deleteHandBack(name: string): Promise<boolean> {
  const nameKey = currentNameKey();
  if (!nameKey) return false;
  setLeaving(true);
  try {
    await handBack(nameKey);
  } catch {
    /* nothing handed back: the copy stays, locked, so nothing is lost */
    return switchSpace({ ...recordOpening(nameKey), state: 'locked' }, deletedHereWords(name));
  }
  await dropSpace(nameKey);
  return switchSpace(recordWithout(nameKey), deletedHereWords(name));
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
    // Something is not in the account (or it could not be told): kept, locked.
    await closeSpaceDb(nameKey);
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
  const lost = [...unsyncedLines(kept.changes), ...(kept.savedRuns ? [`${kept.savedRuns} saved run${kept.savedRuns === 1 ? '' : 's'}`] : [])];
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
