// The run library's door to runs in the cloud (stage 63 C1, ADR 0153).
// The library (src/runs/library.ts) never imports the cloud: the page's
// sync runtime (src/cloud/space/runtime.ts, loaded lazily, only in an
// account's space with the flag `runs` on) sets this hook, and the
// library tells it of saves and deletes and asks it to fetch a session's
// cloud-only runs before they are read. Without a hook (a guest, the flag
// off) a save is a local save and nothing is fetched. Tiny and dependency
// free.

export interface FetchProgressFn {
  (done: number, total: number): void;
}

/** What fetching a session's cloud-only runs came to. */
export type EnsureResult = { ok: true } | { ok: false; why: string };

export interface RunCloudHook {
  /** A save of these runs (sealed or not yet: the queue takes the sealed ones). */
  saved(runIds: readonly string[]): void;
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

/** Why a session in the cloud could not be opened when its runs could not be fetched (stage 63 C2). */
export function notFetchedWords(why: string): string {
  switch (why) {
    case 'offline':
      return 'This session is in the cloud and needs the network to open.';
    case 'server':
      return 'This session could not be fetched from the cloud: the server did not answer. Try again in a while.';
    case 'missing':
      return 'This session is no longer in the cloud.';
    case 'newer':
      return 'This session was saved by a newer WebCockpit. Reload the page to open it.';
    case 'unreadable':
      return 'This session in the cloud could not be read.';
    case 'session_ended':
      return 'This session is in the cloud, and you are no longer logged in.';
    default:
      return 'This session is in the cloud and could not be fetched.';
  }
}
