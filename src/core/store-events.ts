// "Something the sync carries was stored" (stage 61, ADR 0151; stage 62,
// ADR 0152): the sync's local-change trigger. The stores call `noteStored`
// after a write of their own reached IndexedDB; the sync runtime
// (src/cloud/space/runtime.ts, loaded lazily) listens. Tiny and dependency
// free: the stores are on the start-up path.
//
//   profile     the profile store
//   script      the script library, a write touching user scripts
//   settings    the settings store, at each flush
//   scriptData  the script library, a write touching script data
//   comm        the Comm archive, after each append transaction
//   timers      the timers archive, after each save
//   exportDoc   the run library, an export doc saved (stage 63, ADR 0153)
//   runSealed   the capture store, a saved run sealed (the upload queue of
//               runs in the cloud takes it; stage 63 C2)
//   looks       the looks store, a look chosen (stage 80, ADR 0172)
//   lookImage   the own images, one added or removed (stage 80)
//
// The sync's own writes (the adapters' put/remove) do not note. They are
// told the other way, for the caches that must follow a pull at once
// during play: `noteSynced` (the looks and the own images; stage 80).

export type StoredKind = 'profile' | 'script' | 'settings' | 'scriptData' | 'comm' | 'timers' | 'exportDoc' | 'runSealed' | 'looks' | 'lookImage';

const listeners = new Set<(kind: StoredKind) => void>();

/** A write of `kind` reached the current space's database. */
export function noteStored(kind: StoredKind): void {
  for (const fn of [...listeners]) {
    try {
      fn(kind);
    } catch {
      /* a listener's problem */
    }
  }
}

/** Calls `fn` after every `noteStored`; returns the unsubscribe. */
export function onStored(fn: (kind: StoredKind) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The kinds whose pulled changes a page's cache takes in at once (stage 80, ADR 0172). */
export type SyncedKind = 'looks' | 'lookImage';

const synced = new Set<(kind: SyncedKind) => void>();

/** The sync wrote `kind` into the current space's database (this tab's sync, or another tab's: src/cloud/space/notify.ts). */
export function noteSynced(kind: SyncedKind): void {
  for (const fn of [...synced]) {
    try {
      fn(kind);
    } catch {
      /* a listener's problem */
    }
  }
}

/** Calls `fn` after every `noteSynced`; returns the unsubscribe. */
export function onSynced(fn: (kind: SyncedKind) => void): () => void {
  synced.add(fn);
  return () => void synced.delete(fn);
}
