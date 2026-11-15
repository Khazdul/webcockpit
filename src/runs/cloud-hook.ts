// The run library's door to runs in the cloud (stage 63 C1, ADR 0153).
// The library (src/runs/library.ts) never imports the cloud: the page's
// sync runtime (src/cloud/space/runtime.ts, loaded lazily, only in an
// account's space with the flag `runs` on) sets this hook, and the
// library tells it of saves and deletes and asks it to fetch a session's
// cloud-only runs before they are read. Without a hook (a guest, the flag
// off) a save is a local save and nothing is fetched. Tiny and dependency
// free.

/** Where a save was asked (the "does not fit" dialog is shown there; `start` after an Exit). */
export type SaveWhere = 'history' | 'exit' | 'start';

export interface FetchProgressFn {
  (done: number, total: number): void;
}

/** What fetching a session's cloud-only runs came to. */
export type EnsureResult = { ok: true } | { ok: false; why: string };

export interface RunCloudHook {
  /** A save of these runs (sealed or not yet: the queue takes the sealed ones). */
  saved(runIds: readonly string[], where: SaveWhere): void;
  /** These runs were deleted by the player (their rows and bodies follow the sync). */
  removed(runIds: readonly string[]): void;
  /** Fetches the runs among `runIds` that are only in the cloud. */
  fetch(runIds: readonly string[], onProgress?: FetchProgressFn): Promise<EnsureResult>;
}

let hook: RunCloudHook | null = null;

export function setRunCloudHook(h: RunCloudHook | null): void {
  hook = h;
}

export function runCloudHook(): RunCloudHook | null {
  return hook;
}

/** Why a session could not be opened when its runs could not be fetched (stage 63 C2 may give better words). */
export function notFetchedWords(why: string): string {
  return why === 'offline' ? 'This session is in the cloud and could not be fetched: no connection.' : 'This session is in the cloud and could not be fetched.';
}
