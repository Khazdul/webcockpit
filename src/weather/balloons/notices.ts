// The balloon notices' entry (stage 69, ADR 0159): the lazy chunk the
// weather controller imports while Weather effects → Balloons is on. It
// wires the run's kills (feed.ts) to the balloons (balloons.ts).
//
// The rating is the Statistics pane's: the kill's XP against the median of
// the chain's last 30 mob kills. The chain's earlier runs are read once
// from the store (again when a run starts); the live run's kills are read
// from memory on each kill (O(kills), a few hundred at most, once per kill).

import type { RunEvent } from '../../runs/events';
import type { WeatherRuns } from '../hook';
import { type Balloons, type BalloonsHost, startBalloons } from './balloons';
import { noticeOf, raterFor } from './feed';

export type { Balloons };

export interface NoticesDeps extends BalloonsHost {
  runs?: WeatherRuns;
}

const isKill = (e: RunEvent): boolean => e.type === 'kill' || e.type === 'pkill';

export function startNotices(d: NoticesDeps): Balloons {
  const balloons = startBalloons(d);
  const runs = d.runs;
  if (!runs) return balloons;
  let prior: RunEvent[] = [];
  let gone = false;
  let seed = 0;
  const reseed = (): void => {
    const n = ++seed;
    runs
      .chain()
      .then((all) => {
        if (gone || n !== seed) return;
        // The live run's events are the same objects in the chain: leave them out.
        const live = new Set(runs.live());
        prior = all.filter((e) => isKill(e) && !live.has(e));
      })
      .catch(() => {
        /* no store: the live run alone */
      });
  };
  reseed();
  const unsub = runs.subscribe((e) => {
    if (e.type === 'run_start') {
      prior = [];
      reseed();
      return;
    }
    if (!isKill(e)) return;
    const n = noticeOf(e, raterFor(prior, runs.live()));
    if (n) balloons.show(n);
  });
  return {
    show: (k) => balloons.show(k),
    list: () => balloons.list(),
    destroy() {
      gone = true;
      unsub();
      balloons.destroy();
    },
  };
}
