// Starts the usage heartbeat (src/cloud/beat.ts) for the page, when it may
// run: not on the dev server, not in an automated browser (both unless the
// dev-only `?cloudtest` of the e2e specs), and only when the server has the
// flag `stats` on (spec §7.0 rule 5). src/main.ts imports this module on
// idle time after the start page is up, so neither it nor the flags'
// request touch the cold start or the game path.

import type { BeatState } from '../../shared/cloud/api.ts';
import { CLIENT_VERSION } from '../core/build-info';
import { device } from '../core/device';
import { type BeatHandle, startBeat } from './beat';
import { automated, cloudTest, flagOn } from './config';
import { browserFamily, deviceType } from './device-info';

/** What the beat needs of the shell (src/app/shell.ts). */
export interface BeatView {
  readonly view: BeatState;
  onView(fn: () => void): () => void;
}

/** True when this page may send beats at all (before the flag is asked). */
export function beatAllowed(): boolean {
  if (cloudTest()) return true;
  return !import.meta.env.DEV && !automated();
}

/** Starts the beat if allowed and the flag is on; resolves to its handle, or null. Never rejects. */
export async function startCloud(shell: BeatView): Promise<BeatHandle | null> {
  try {
    if (!beatAllowed() || !(await flagOn('stats'))) return null;
    const beat = startBeat({
      state: () => shell.view,
      version: CLIENT_VERSION,
      type: deviceType(device()),
      browser: browserFamily(globalThis.navigator?.userAgent ?? ''),
    });
    shell.onView(() => beat.stateChanged());
    return beat;
  } catch {
    return null;
  }
}
