// The real trackers of the hub (ADR 0017, P1 notes): affects, stored
// spells, blinds, charms, herblores, sanctuary on others (ADR 0122), with
// the shared cast queue and the stat/info reconcile wired between them. `TimersHub` calls
// `createTrackers(host)` once, unless its options give another factory.
//
// Every game line reaches the trackers through one `LineRouter` (one
// catch-all system action, then a Map lookup; see lines.ts). The router is
// installed by the 'rules' pseudo-tracker, which also resets the stat/info
// block collector on a new connection.

import { AffectsTracker } from './affects';
import { BlindsTracker } from './blinds';
import { CastQueue } from './castq';
import { CharmTracker } from './charm';
import type { TimerCell } from './entry';
import { HerbloreTracker } from './herblore';
import { LineRouter } from './lines';
import { StatReconcile } from './reconcile';
import { SanctOthersTracker } from './sanct';
import { StoredTracker } from './stored';
import type { Tracker, TrackerHost } from './tracker';

/** The installed router and trackers, for tests. */
export interface TimersTrackers {
  router: LineRouter;
  casts: CastQueue;
  affects: AffectsTracker;
  stored: StoredTracker;
  blinds: BlindsTracker;
  charms: CharmTracker;
  herbs: HerbloreTracker;
  sanct: SanctOthersTracker;
  reconcile: StatReconcile;
  list: Tracker[];
}

/** Builds the trackers and wires them to one router. */
export function buildTrackers(host: TrackerHost): TimersTrackers {
  const now = (): number => host.now();
  const router = new LineRouter();
  const casts = new CastQueue(now);
  const affects = new AffectsTracker(host);
  const stored = new StoredTracker(host, casts);
  const blinds = new BlindsTracker(host, casts);
  const charms = new CharmTracker(host, casts);
  const herbs = new HerbloreTracker(host);
  const sanct = new SanctOthersTracker(host);
  const reconcile = new StatReconcile(affects, stored, now);
  reconcile.route(router);
  casts.route(router);
  affects.route(router);
  stored.route(router);
  blinds.route(router);
  charms.route(router);
  const rules: Tracker = {
    key: 'rules',
    cells: (): TimerCell[] => [],
    serialize: () => undefined,
    restore: () => {},
    reset: () => reconcile.reset(),
    installRules: (system) => router.install(system),
  };
  return {
    router,
    casts,
    affects,
    stored,
    blinds,
    charms,
    herbs,
    sanct,
    reconcile,
    list: [rules, casts, affects, stored, blinds, charms, herbs, sanct],
  };
}

/** The trackers, in the order the hub calls them. */
export function createTrackers(host: TrackerHost): Tracker[] {
  return buildTrackers(host).list;
}
