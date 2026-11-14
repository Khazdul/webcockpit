// The current space (ADR 0150): the device's, or a logged-in account's.
//
// Each space is an IndexedDB database of its own: the device's is
// `webcockpit` (what a guest sees), an account's `webcockpit-u-<nameKey>`
// (nameKey: the account name in lower case). Every store reads the current
// space through `openWebcockpitDb()` (src/core/db.ts); the map, the
// tilesets and the locator's ids are the device's whoever is logged in
// (`openDeviceDb()`, src/core/db.ts).
//
// The space is decided ONCE, at the page's first call, from the record in
// localStorage:
//
//   wc.space   {"nameKey":"olev","state":"open"}     the account's space
//              {"nameKey":"olev","state":"locked"}   the device's space; the
//                                                    account's copy is kept
//              ... "locked":["anna"]                 other locked copies kept
//              absent (or unreadable)                the device's space
//
// A change of space never happens in place: `switchSpace` writes the
// record, leaves the message for the start menu in sessionStorage (read
// once by `takeSpaceMessage`) and reloads the page to the start menu, so
// every cached connection and record is read from the new space by
// construction. Other tabs follow by the `storage` event (`followSpace`;
// the shell reloads on the start page, or once a game is left).
//
// A tab in a game holds the shared Web Lock `webcockpit-game@<space id>`
// (`holdGameLock`), so a log out can ask whether a game runs on the space
// it is about to delete (`gameRunningElsewhere`).
//
// Small and dependency free on purpose: the start page imports it.

/** The device's database (= `DB_NAME` of src/core/db.ts). */
export const DEVICE_DB_NAME = 'webcockpit';
/** An account's database is `ACCOUNT_SPACE_PREFIX + nameKey`. */
export const ACCOUNT_SPACE_PREFIX = 'webcockpit-u-';
/** localStorage: the space record. */
export const SPACE_KEY = 'wc.space';
/** sessionStorage: the message for the start menu after a change of space. */
export const SPACE_MESSAGE_KEY = 'wc.space.message';

export type Space = { kind: 'device' } | { kind: 'account'; nameKey: string };

/** The record in `wc.space`. */
export interface SpaceRecord {
  nameKey: string;
  /** `open`: the page is in the account's space. `locked`: in the device's; the copy is kept. */
  state: 'open' | 'locked';
  /** Further locked copies kept beside `nameKey` (ADR 0150 "The locked copy"). */
  locked?: string[];
}

export const DEVICE_SPACE: Space = Object.freeze({ kind: 'device' });

/** An account's name key: the server's `name_key` (NAME_PATTERN in lower case). */
const NAME_KEY = /^[a-z0-9_-]{3,20}$/;

export function isNameKey(v: unknown): v is string {
  return typeof v === 'string' && NAME_KEY.test(v);
}

function store(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null; // blocked
  }
}

/** The record from its stored text; null when absent or not a record. */
export function parseSpaceRecord(raw: string | null | undefined): SpaceRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SpaceRecord> | null;
    if (!v || typeof v !== 'object' || !isNameKey(v.nameKey)) return null;
    if (v.state !== 'open' && v.state !== 'locked') return null;
    const locked = Array.isArray(v.locked) ? [...new Set(v.locked.filter(isNameKey))].filter((k) => k !== v.nameKey) : [];
    return locked.length ? { nameKey: v.nameKey, state: v.state, locked } : { nameKey: v.nameKey, state: v.state };
  } catch {
    return null;
  }
}

/** The space a record puts the page in. */
export function spaceOf(rec: SpaceRecord | null): Space {
  return rec && rec.state === 'open' ? { kind: 'account', nameKey: rec.nameKey } : DEVICE_SPACE;
}

/** The record in localStorage now (not the page's: that is `currentSpace`). */
export function readSpaceRecord(storage: Storage | null = store('localStorage')): SpaceRecord | null {
  try {
    return parseSpaceRecord(storage?.getItem(SPACE_KEY));
  } catch {
    return null;
  }
}

let current: Space | null = null;

/** The page's space, decided at the first call and kept for the page's life. */
export function currentSpace(): Space {
  current ??= spaceOf(readSpaceRecord());
  return current;
}

/** Tests: decide the space again at the next call (or set it). */
export function resetSpaceForTests(space: Space | null = null): void {
  current = space;
  messageTaken = false;
}

export function sameSpace(a: Space, b: Space): boolean {
  return a.kind === b.kind && (a.kind === 'device' || a.nameKey === (b as { nameKey: string }).nameKey);
}

/** The space's database name. */
export function spaceDbName(space: Space = currentSpace()): string {
  return space.kind === 'device' ? DEVICE_DB_NAME : ACCOUNT_SPACE_PREFIX + space.nameKey;
}

/** A short id of the space (`device`, `u-<nameKey>`), for lock and key names. */
export function spaceId(space: Space = currentSpace()): string {
  return space.kind === 'device' ? 'device' : `u-${space.nameKey}`;
}

/**
 * The localStorage key of `key` in `space`: the device's keep their names,
 * an account's get `@u-<nameKey>` appended.
 */
export function spaceStorageKey(key: string, space: Space = currentSpace()): string {
  return space.kind === 'device' ? key : `${key}@${spaceId(space)}`;
}

/** Every account copy kept locked on this device (from the record now). */
export function lockedCopies(rec: SpaceRecord | null = readSpaceRecord()): string[] {
  if (!rec) return [];
  return rec.state === 'locked' ? [rec.nameKey, ...(rec.locked ?? [])] : [...(rec.locked ?? [])];
}

/** Writes the record (null removes it). False when localStorage would not take it. */
export function writeSpaceRecord(rec: SpaceRecord | null, storage: Storage | null = store('localStorage')): boolean {
  try {
    if (!storage) return false;
    if (rec) storage.setItem(SPACE_KEY, JSON.stringify(rec));
    else storage.removeItem(SPACE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Loads the start menu afresh (the page's path, no query or hash). */
export function reloadToStart(loc: Location | undefined = globalThis.location): void {
  try {
    loc?.replace(loc.pathname);
  } catch {
    /* no location */
  }
}

/**
 * Changes the space: writes `wc.space` (null: the device's, nothing kept),
 * leaves `message` for the start menu, and reloads to it. False (and no
 * reload) when localStorage would not take the record.
 */
export function switchSpace(next: SpaceRecord | null, message?: string, reload: () => void = reloadToStart): boolean {
  if (!writeSpaceRecord(next)) return false;
  try {
    const s = store('sessionStorage');
    if (message) s?.setItem(SPACE_MESSAGE_KEY, message);
    else s?.removeItem(SPACE_MESSAGE_KEY);
  } catch {
    /* the message is lost; the change is not */
  }
  reload();
  return true;
}

let messageTaken = false;

/** True when this load carries a message from a change of space (not taken yet). */
export function spaceMessagePending(): boolean {
  if (messageTaken) return false;
  try {
    return !!store('sessionStorage')?.getItem(SPACE_MESSAGE_KEY);
  } catch {
    return false;
  }
}

/** The message left by `switchSpace`, once; null afterwards and when there is none. */
export function takeSpaceMessage(): string | null {
  if (messageTaken) return null;
  messageTaken = true;
  try {
    const s = store('sessionStorage');
    const m = s?.getItem(SPACE_MESSAGE_KEY) ?? null;
    s?.removeItem(SPACE_MESSAGE_KEY);
    return m || null;
  } catch {
    return null;
  }
}

/**
 * Calls `fn` when another tab changes `wc.space` so that this page's space
 * is no longer the one in the record. Returns the unsubscribe.
 */
export function followSpace(fn: (next: Space) => void, win: Window | undefined = globalThis.window): () => void {
  if (!win?.addEventListener) return () => {};
  const on = (e: StorageEvent): void => {
    // null: the whole storage was cleared.
    if (e.key !== null && e.key !== SPACE_KEY) return;
    const next = spaceOf(parseSpaceRecord(e.key === null ? null : e.newValue));
    if (!sameSpace(next, currentSpace())) fn(next);
  };
  win.addEventListener('storage', on);
  return () => win.removeEventListener('storage', on);
}

/** Deletes an account's database (never the device's). Resolves when it is gone. */
export function deleteSpaceDb(nameKey: string, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
  if (!isNameKey(nameKey)) return Promise.reject(new Error(`not an account name key: ${nameKey}`));
  if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const r = factory.deleteDatabase(ACCOUNT_SPACE_PREFIX + nameKey);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error ?? new Error('the database could not be deleted'));
  });
}

// ------------------------------------------------------------ the game lock

/** The Web Lock a game tab holds on its space. */
export function gameLockName(space: Space = currentSpace()): string {
  return `webcockpit-game@${spaceId(space)}`;
}

function locks(): LockManager | null {
  try {
    return globalThis.navigator?.locks ?? null;
  } catch {
    return null;
  }
}

let held: { name: string; release: () => void } | null = null;

/**
 * Holds the game lock of `space` (shared: two game tabs of one space both
 * hold it) until the returned function is called. Idempotent while held.
 */
export function holdGameLock(space: Space = currentSpace()): () => void {
  const name = gameLockName(space);
  if (held?.name === name) return held.release;
  held?.release();
  const lm = locks();
  let release = (): void => {};
  const done = new Promise<void>((r) => (release = r));
  const me = {
    name,
    release: (): void => {
      release();
      if (held === me) held = null;
    },
  };
  held = me;
  if (lm) void lm.request(name, { mode: 'shared' }, () => done).catch(() => {});
  return me.release;
}

/** True while this page holds a game lock. */
export function holdingGameLock(): boolean {
  return held !== null;
}

/**
 * True when a game runs on `space` in another tab (a holder of its lock
 * besides this page). False without Web Locks.
 */
export async function gameRunningElsewhere(space: Space): Promise<boolean> {
  const lm = locks();
  if (!lm?.query) return false;
  try {
    const name = gameLockName(space);
    const snap = await lm.query();
    const n = (snap.held ?? []).filter((l) => l.name === name).length;
    return n > (held?.name === name ? 1 : 0);
  } catch {
    return false;
  }
}
