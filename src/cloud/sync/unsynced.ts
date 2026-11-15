// The local changes not in the account, from the stores alone (no
// network): one routine for the engine's `unsynced()` (records matched by
// server id) and the spaces' `pendingChanges` (matched by local key: a
// lost session has no keys left to make server ids with). The rules:
// new (no record, or rev 0), edited (the hash differs), deleted (a record
// with an agreed base and a local key, but no item).

import { type KindSpec, itemHashes } from './items';
import type { LocalItems, SyncRecord, Unsynced } from './types';

export interface UnsyncedMatch {
  /** The id a local item is matched by (its server id, or its local key). */
  item(spec: KindSpec, key: string): Promise<string>;
  /** The same id of a record; null leaves the record out. */
  record(rec: SyncRecord): string | null;
}

export async function listUnsynced(specs: readonly KindSpec[], local: LocalItems, recs: readonly SyncRecord[], match: UnsyncedMatch): Promise<Unsynced[]> {
  const out: Unsynced[] = [];
  for (const spec of specs) {
    const mine = new Map<string, SyncRecord>();
    for (const r of recs) {
      if (r.kind !== spec.kind) continue;
      const id = match.record(r);
      if (id !== null) mine.set(id, r);
    }
    const seen = new Set<string>();
    for (const li of await local.list(spec.kind)) {
      const id = await match.item(spec, li.key);
      seen.add(id);
      const rec = mine.get(id);
      const name = spec.names?.get(li.body) ?? null;
      if (!rec || rec.rev === 0) out.push({ kind: spec.kind, key: li.key, name, change: 'new' });
      else if ((await itemHashes(spec, li.body).catch(() => null))?.hash !== rec.hash) out.push({ kind: spec.kind, key: li.key, name, change: 'edit' });
    }
    for (const [id, rec] of mine) {
      if (!seen.has(id) && rec.rev > 0 && rec.hash !== null && rec.key !== null) out.push({ kind: spec.kind, key: rec.key, name: rec.name, change: 'delete' });
    }
  }
  return out;
}
