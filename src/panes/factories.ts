// Pane factories (ADR 0016 "Pane context"): one per pane id. The cockpit
// builds every side pane through this table with the app's PaneContext.
// Kept apart from pane.ts, which the subclasses import.

import type { PaneId } from '../layout/types';
import { CharacterPane } from './character';
import { CommPane } from './comm';
import type { PaneContext } from './context';
import { GroupPane } from './group';
import { MapPane } from './map';
import type { PaneShell } from './pane';
import { StatsPane } from './statistics';
import { TimersPane } from './timers';
import { UiPane } from './ui';

/** Builds pane `id` from the context. */
export type PaneFactory = (ctx: PaneContext) => PaneShell;

export const PANE_FACTORIES: Readonly<Record<PaneId, PaneFactory>> = {
  character: (ctx) => new CharacterPane(ctx),
  timers: (ctx) => new TimersPane(ctx),
  group: (ctx) => new GroupPane(ctx),
  comm: (ctx) => new CommPane(ctx),
  ui: (ctx) => new UiPane(ctx),
  map: (ctx) => new MapPane(ctx),
  statistics: (ctx) => new StatsPane(ctx),
};
