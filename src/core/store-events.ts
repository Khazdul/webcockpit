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
//
// The sync's own writes (the adapters' put/remove) do not note.

export type StoredKind = 'profile' | 'script' | 'settings' | 'scriptData' | 'comm' | 'timers';

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
