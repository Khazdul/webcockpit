// The directory of shared looks as the page uses it (stage 80 part E):
// `apiAllowed()`, the flag `looks`, the page's space and `localStorage`.
// The pure parts are src/looks/directory.ts.

import { apiAllowed, flagOn } from '../cloud/config';
import { currentSpace } from '../core/space';
import { LookDirectory } from './directory';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Whether the page may use the directory at all (before the flag is asked). */
const may = (): Promise<boolean> => (apiAllowed() ? flagOn('looks') : Promise.resolve(false));

/** The game's directory: silent while `replay()` (the dev feed, a log). */
export function pageDirectory(replay: () => boolean): LookDirectory {
  return new LookDirectory({
    enabled: () => !replay() && may(),
    space: () => (currentSpace().kind === 'account' ? 'account' : 'device'),
    storage: storage(),
  });
}

/**
 * The take-over at login (spec §9): the device's rows go just before a
 * login, so the account's report after it is not refused. Never rejects.
 */
export function releaseDeviceLooks(): Promise<void> {
  return new LookDirectory({ enabled: may, space: () => 'device', storage: storage(), idle: (fn) => fn() }).releaseDevice().catch(() => undefined);
}
