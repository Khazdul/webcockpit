// The last GMCP value per message, for the scripts' `gmcp` table (ADR 0051
// "Feedback round 2").
//
// App attaches one cache to the bus from the start (no Lua, a few lines in
// the cold-start chunk), so GMCP that arrived before the script host and
// the Lua runtime were loaded is in `gmcp` when the first script loads. The
// host reads the cache and follows it (`subscribe`); without one (tests,
// the bench) it attaches its own.
//
// Merge or replace (MUME's packages, /home/ole/MUME/docs/gmcp.md):
// - Merged key by key into the last value: `Char.Vitals` and
//   `Char.StatusVars`, which MUME sends as partial updates of one object
//   (a Char.Vitals with just `hp`). A JSON `null` removes the key.
// - Replaced: everything else. These are complete snapshots (`Char.Name`,
//   `Room.Info`, `Group.Set`, `Room.Chars.Set`, `Comm.Channel.List`) or one
//   entity, change or event per message (`Group.Add/Update/Remove`,
//   `Room.Chars.Add/Update/Remove`, `Room.UpdateExits`,
//   `Comm.Channel.Text`, `Event.*`, `Core.*`), so merging would mix
//   different members, rooms or messages.
// - The cache is cleared when a new connection starts (`connecting`).
// - `attach(bus, before)`: `before` gets each bus message before the cache
//   stores it and tells its listeners. App and the host pass the game
//   state's `take`, so `state.char` and `state.group` are current when a
//   script's GMCP handler runs, whatever the bus order (ADR 0090 §3).

import type { Bus } from '../core/bus';
import type { BusEvents } from '../core/types';

/** Lower-case names of the messages that merge into their last value. */
export const MERGED_GMCP: ReadonlySet<string> = new Set(['char.vitals', 'char.statusvars']);

/** One message's value, with the package name as MUME sent it. */
export interface GmcpEntry {
  pkg: string;
  value: unknown;
}

export class GmcpCache {
  private readonly map = new Map<string, GmcpEntry>();
  private readonly listeners = new Set<(key: string, e: GmcpEntry) => void>();

  /** Stores one message (merged or replaced, see the file header) and tells the listeners. */
  apply(pkg: string, data: unknown): GmcpEntry {
    const key = pkg.toLowerCase();
    let value = data;
    if (MERGED_GMCP.has(key) && isObject(data)) {
      const prev = this.map.get(key)?.value;
      const merged: Record<string, unknown> = isObject(prev) ? { ...prev } : {};
      for (const k in data) {
        const v = data[k];
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      value = merged;
    }
    const e: GmcpEntry = { pkg, value };
    this.map.set(key, e);
    for (const fn of this.listeners) fn(key, e);
    return e;
  }

  /** The value of a message by its lower-case name. */
  get(key: string): GmcpEntry | undefined {
    return this.map.get(key);
  }

  entries(): IterableIterator<GmcpEntry> {
    return this.map.values();
  }

  clear(): void {
    this.map.clear();
  }

  /** Called after every stored message. Returns the unsubscribe. */
  subscribe(fn: (key: string, e: GmcpEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Follows the bus: every `gmcp` message (handed to `before` first),
   * cleared on `connecting`. Returns the detach.
   */
  attach(bus: Bus, before?: (m: BusEvents['gmcp']) => void): () => void {
    const a = bus.on('conn.state', (s) => {
      if (s.state === 'connecting') this.clear();
    });
    const b = bus.on('gmcp', (m) => {
      before?.(m);
      this.apply(m.pkg, m.data);
    });
    return () => {
      a();
      b();
    };
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
