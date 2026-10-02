// Pane context (ADR 0016 "Pane context"): everything a side pane may use,
// handed to each `PANE_FACTORIES[id](ctx)` by the cockpit. App builds the
// real one; `createPaneContext({ doc })` fills test defaults.
//
// Rules for panes:
// - Subscribe to the bus / settings in the constructor, unsubscribe in
//   `dispose()` (PaneShell keeps a list: `this.own(unsubscribe)`).
// - GMCP handlers only update model state and call `markDirty()`; the pane
//   renders once in the next frame (`requestFrame`), never per message.
// - `openDb()` is lazy and shared: the first call opens the `webcockpit`
//   database, later calls get the same connection (reopened if it closed).
//   It rejects when IndexedDB is unavailable; the pane then works in memory.

import { Bus } from '../core/bus';
import { openWebcockpitDb } from '../core/db';
import type { ConnState, Sender } from '../core/types';
import { GameState } from '../gmcp/state';
import type { MapMarkHub } from '../map/marks';
import type { MapPaneHost } from '../map/protocol';
import { SettingsStore } from '../settings';

/** The cell size source (src/theme/cells.ts `CellMetrics` fits). */
export interface CellSource {
  get(): { w: number; h: number };
  subscribe(fn: (c: { w: number; h: number }) => void): () => void;
}

export interface PaneContext {
  readonly doc: Document;
  /** The app bus: `gmcp`, `conn.state`, `text.line`, `ui.message` … */
  readonly bus: Bus;
  /** The live settings (pane colours, `group`, `comm` options). */
  readonly settings: SettingsStore;
  /** Cell size in px (`--cell-w` / `--cell-h`). */
  readonly cells: CellSource;
  /** Frame scheduler for pane renders (requestAnimationFrame in the app). */
  readonly requestFrame: (cb: () => void) => void;
  /** Sends commands and GMCP to the game (dropped when not connected). */
  readonly sender: Sender;
  /** The connection state now (panes follow later changes on the bus). */
  readonly connState: () => ConnState;
  /** Lazy, shared IndexedDB connection (see the file header). */
  readonly openDb: () => Promise<IDBDatabase>;
  /** Wall clock in ms (`Date.now`); injectable for tests. */
  readonly now: () => number;
  /** `localStorage`, or null when unavailable (clock state, Inv §2.5). */
  readonly localStorage: Storage | null;
  /** `sessionStorage`, or null when unavailable (UI message ring). */
  readonly sessionStorage: Storage | null;
  /**
   * Character, group and clock models fed from the bus (src/gmcp/state.ts,
   * P1). Shared with the input-line clock strip.
   */
  readonly game: GameState;
  /**
   * What the Map pane shows (ADR 0020). Absent: the bundled map
   * (`defaultMapHost` in src/panes/map.ts).
   */
  readonly map?: MapPaneHost;
  /** Script map marks (ADR 0057): the Map pane attaches to it once its map is loaded. */
  readonly mapMarks?: MapMarkHub;
  /**
   * A log player's pane (ADR 0021): read-only, nothing that would change
   * game or profile state (the Timers corner `+` and charm `×` are gone).
   */
  readonly player?: boolean;
}

/** A sender that drops everything (tests, a cockpit without a session). */
export const NULL_SENDER: Sender = {
  sendCommand: () => {},
  sendGmcp: () => {},
};

/** Default frame scheduler: requestAnimationFrame, or a 0 ms timeout without a DOM. */
export function defaultRequestFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb());
  else setTimeout(cb, 0);
}

/**
 * A lazy, memoised database opener over `factory` (default
 * `globalThis.indexedDB`; null = none, always rejects). A connection that
 * closes (another tab upgrading the database) is reopened on the next call.
 */
export function lazyDb(factory?: IDBFactory | null): () => Promise<IDBDatabase> {
  let p: Promise<IDBDatabase> | null = null;
  return () => {
    if (p) return p;
    const f = factory === undefined ? (globalThis.indexedDB ?? null) : factory;
    if (!f) return Promise.reject(new Error('IndexedDB unavailable'));
    const opened = openWebcockpitDb(f).then(
      (db) => {
        db.addEventListener('close', () => {
          if (p === opened) p = null;
        });
        const onVersionChange = db.onversionchange;
        db.onversionchange = (ev) => {
          if (p === opened) p = null;
          onVersionChange?.call(db, ev);
        };
        return db;
      },
      (err: unknown) => {
        if (p === opened) p = null;
        throw err;
      },
    );
    p = opened;
    return opened;
  };
}

function storage(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * A complete context from a partial one. Defaults: a new Bus, an in-memory
 * settings store, a fixed 8×16 cell, `defaultRequestFrame`, `NULL_SENDER`,
 * state `idle`, no database, `Date.now`, the global storages, and a
 * GameState that is not attached to the bus (clock in memory only; call
 * `ctx.game.attach(ctx.bus)` or feed it with `onGmcp` in a test).
 */
export function createPaneContext(p: Partial<PaneContext> & { doc: Document }): PaneContext {
  const bus = p.bus ?? new Bus();
  const now = p.now ?? Date.now;
  return {
    doc: p.doc,
    bus,
    settings: p.settings ?? new SettingsStore({ factory: null, storage: null, win: null }),
    cells: p.cells ?? { get: () => ({ w: 8, h: 16 }), subscribe: () => () => {} },
    requestFrame: p.requestFrame ?? defaultRequestFrame,
    sender: p.sender ?? NULL_SENDER,
    connState: p.connState ?? (() => 'idle'),
    openDb: p.openDb ?? lazyDb(null),
    now,
    localStorage: p.localStorage === undefined ? storage('localStorage') : p.localStorage,
    sessionStorage: p.sessionStorage === undefined ? storage('sessionStorage') : p.sessionStorage,
    game: p.game ?? new GameState({ now }),
    ...(p.map ? { map: p.map } : {}),
    ...(p.player ? { player: true } : {}),
  };
}
