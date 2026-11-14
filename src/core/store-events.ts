// "A profile or a user script was stored" (stage 61, ADR 0151): the sync's
// trigger "5 s after a local change". The profile store and the script
// library call `noteStored` after a write that reached IndexedDB; the sync
// runtime (src/cloud/space/runtime.ts, loaded lazily) listens. Tiny and
// dependency free: the stores are on the start-up path.

export type StoredKind = 'profile' | 'script';

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
