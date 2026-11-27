// The chosen looks (stage 80 §4, ADR 0169): your own characters' and the
// group members' you assigned, by character name (lower case), in the
// current space's database (ADR 0150): logged out, the device's space.
//
//   store `looks`, one record under the key `looks`:
//   { names: { [name]: { look: LookRef, at: number, own?: true } } }
//
// - `own` is set when the choice was made for the character being played.
// - A reset to automatic is an entry too (`{src:'auto'}`), so that it wins
//   over an older choice on another device (the sync kind `looks`, part D:
//   policy `merge`, per name the newest `at` wins: `mergeLooks`).
// - At most `LOOKS_MAX` names. The prune is the same on every device, or two
//   devices would push at each other for ever: entries without `own`, by
//   `at` ascending and then by name, go first; `own` entries never.
// - The pane reads it synchronously (`lookFor`): the record is loaded once,
//   and every change is written through. Without a database (private mode,
//   a test) it works in memory.
// - A preview (`preview`): the picker shows its selection live in the panes
//   without storing it; Cancel clears it, "Use this look" stores it.
// - Sync (part D, ADR 0172): a save merges the record into what is stored
//   (one transaction), so a pulled change the sync wrote meanwhile is never
//   overwritten; a pulled change is read again at once, also during play
//   (`onSynced`). The own images (`images`, src/looks/images.ts) ride along:
//   a change of the shelf is a change of the looks for the panes.

import { STORE, idbDone, idbRequest } from '../core/db';
import { noteStored, onSynced } from '../core/store-events';
import type { OwnImages } from './images';
import { AUTO, type LookRef, lookName, lookRef, sameLook } from './types';

export const LOOKS_KEY = 'looks';
export const LOOKS_MAX = 500;

export interface LookEntry {
  look: LookRef;
  /** When it was chosen, ms since the epoch. */
  at: number;
  /** Chosen for the character being played (never pruned). */
  own?: true;
}

export interface LooksDoc {
  names: Record<string, LookEntry>;
}

const empty = (): Record<string, LookEntry> => Object.create(null) as Record<string, LookEntry>;
export const emptyLooks = (): LooksDoc => ({ names: empty() });

/** A doc from anything (a stored or pulled record): bad entries are dropped, names lower-cased (the newest wins a clash). */
export function parseLooks(raw: unknown): LooksDoc {
  const out = emptyLooks();
  const names = raw && typeof raw === 'object' ? (raw as { names?: unknown }).names : null;
  if (!names || typeof names !== 'object' || Array.isArray(names)) return out;
  for (const [k, v] of Object.entries(names as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as { look?: unknown; at?: unknown; own?: unknown };
    const look = lookRef(e.look);
    const name = lookName(k);
    if (!look || !name || typeof e.at !== 'number' || !Number.isFinite(e.at)) continue;
    const prev = out.names[name];
    if (prev && prev.at >= e.at) continue;
    out.names[name] = { look, at: e.at, ...(e.own === true ? { own: true as const } : {}) };
  }
  return out;
}

/** The doc with at most `max` names (see the file header). */
export function pruneLooks(doc: LooksDoc, max = LOOKS_MAX): LooksDoc {
  const keys = Object.keys(doc.names);
  if (keys.length <= max) return doc;
  const victims = keys
    .filter((k) => !doc.names[k]!.own)
    .sort((a, b) => doc.names[a]!.at - doc.names[b]!.at || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, keys.length - max);
  const names = empty();
  const out = new Set(victims);
  for (const k of keys) if (!out.has(k)) names[k] = doc.names[k]!;
  return { names };
}

/** The doc with `name`'s look set at `at` (`own`: for the character being played; an own entry stays own). */
export function withLook(doc: LooksDoc, name: string, look: LookRef, at: number, own = false): LooksDoc {
  const key = lookName(name);
  const names = empty();
  Object.assign(names, doc.names);
  const wasOwn = names[key]?.own === true;
  names[key] = { look: lookRef(look)!, at, ...(own || wasOwn ? { own: true as const } : {}) };
  return pruneLooks({ names });
}

/** Two docs merged per name, the newest `at` winning (a tie: `b`'s, the pulled one); `own` sticks (part D's sync policy). */
export function mergeLooks(a: LooksDoc, b: LooksDoc): LooksDoc {
  const names = empty();
  Object.assign(names, a.names);
  for (const [k, e] of Object.entries(b.names)) {
    const mine = names[k];
    if (!mine || e.at >= mine.at) names[k] = mine?.own && !e.own ? { ...e, own: true } : e;
    else if (e.own && !mine.own) names[k] = { ...mine, own: true };
  }
  return pruneLooks({ names });
}

export interface LooksStoreOptions {
  /** The current space's database (`PaneContext.openDb`); rejects: in memory. */
  openDb?: (() => Promise<IDBDatabase>) | null;
  now?: () => number;
  /** The own images (part D); absent: none (logged out, tests). */
  images?: OwnImages | null;
}

/** A doc as it is stored (plain objects: a structured clone keeps no prototype anyway). */
const plain = (doc: LooksDoc): LooksDoc => ({ names: { ...doc.names } });

export class LooksStore {
  private doc: LooksDoc = emptyLooks();
  private readonly previews = new Map<string, LookRef>();
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly openDb: (() => Promise<IDBDatabase>) | null;
  /** Resolves when the stored record has been read (or could not be). */
  readonly ready: Promise<void>;
  /** Bumped on every change (stored or previewed): panes key their renders on it. */
  version = 0;
  /** The own images (null: none, logged out). */
  readonly images: OwnImages | null;
  private readonly offs: (() => void)[] = [];

  constructor(o: LooksStoreOptions = {}) {
    this.now = o.now ?? Date.now;
    this.openDb = o.openDb ?? null;
    this.images = o.images ?? null;
    this.ready = this.load();
    if (this.images) this.offs.push(this.images.subscribe(() => this.changed()));
    if (this.openDb) this.offs.push(onSynced((kind) => kind === 'looks' && void this.load()));
  }

  /** Reads the stored record (at start, and after the sync wrote it). */
  private async load(): Promise<void> {
    if (!this.openDb) return;
    try {
      const db = await this.openDb();
      const raw = await idbRequest(db.transaction(STORE.looks, 'readonly').objectStore(STORE.looks).get(LOOKS_KEY));
      // A choice made before the read finished is kept over the stored one (newest `at` wins).
      this.doc = mergeLooks(parseLooks(raw), this.doc);
      this.changed();
    } catch {
      // No database: the looks live in memory for this page.
    }
  }

  /** Writes the record, merged into what is stored (a pulled change written meanwhile stays). */
  private async save(): Promise<void> {
    if (!this.openDb) return;
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE.looks, 'readwrite');
      const done = idbDone(tx);
      const os = tx.objectStore(STORE.looks);
      const merged = mergeLooks(parseLooks(await idbRequest(os.get(LOOKS_KEY))), this.doc);
      os.put(plain(merged), LOOKS_KEY);
      await done;
      noteStored('looks');
      if (Object.keys(merged.names).some((k) => merged.names[k] !== this.doc.names[k])) {
        this.doc = mergeLooks(this.doc, merged);
        this.changed();
      }
    } catch {
      // Kept in memory.
    }
  }

  private changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  /** The stored record (a copy is not made: do not change it). */
  get(): LooksDoc {
    return this.doc;
  }

  /** The stored look for `name` (no preview), or null when nothing was chosen. */
  stored(name: string | null | undefined): LookRef | null {
    if (!name) return null;
    return this.doc.names[lookName(name)]?.look ?? null;
  }

  /** The look to draw for `name`: the picker's preview, else the stored one, else null. */
  lookFor(name: string | null | undefined): LookRef | null {
    if (!name) return null;
    const key = lookName(name);
    return this.previews.get(key) ?? this.doc.names[key]?.look ?? null;
  }

  /** Stores `look` for `name` (`own`: the character being played) and drops its preview. */
  choose(name: string, look: LookRef, own = false): void {
    const key = lookName(name);
    if (!key) return;
    this.previews.delete(key);
    const prev = this.doc.names[key];
    if (prev && sameLook(prev.look, look) && (prev.own || !own)) {
      this.changed();
      return;
    }
    this.doc = withLook(this.doc, key, look, this.now(), own);
    this.changed();
    void this.save();
  }

  /** Shows `look` for `name` without storing it (null: the stored look again). */
  preview(name: string, look: LookRef | null): void {
    const key = lookName(name);
    if (!key) return;
    if (look) this.previews.set(key, look);
    else if (!this.previews.delete(key)) return;
    this.changed();
  }

  /** Replaces the record (a pulled `looks` item, part D). */
  replace(doc: LooksDoc): void {
    this.doc = pruneLooks(doc);
    this.changed();
    void this.save();
  }

  /** The ids of the own images on the shelf (the resolver's `ownImages`), or null without a shelf. */
  ownIds(): ReadonlySet<string> | null {
    return this.images?.ids() ?? null;
  }

  /** An own image as a `data:` URL, or null. */
  ownSrc(id: string): string | null {
    return this.images?.src(id) ?? null;
  }

  /** The names whose stored look is the own image `id`. */
  usersOf(id: string): string[] {
    return Object.keys(this.doc.names)
      .filter((k) => {
        const l = this.doc.names[k]!.look;
        return l.src === 'own' && l.id === id;
      })
      .sort();
  }

  /** Takes an own image off the shelf; the characters that used it go back to automatic (a reset is an entry). */
  async removeImage(id: string): Promise<void> {
    const users = this.usersOf(id);
    if (users.length) {
      const at = this.now();
      let doc = this.doc;
      for (const n of users) doc = withLook(doc, n, AUTO, at);
      this.doc = doc;
      this.changed();
      void this.save();
    }
    await this.images?.remove(id);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
