// The player's own images (stage 80 §3, ADR 0172): the shelf. Account only
// (the owner's decision 2): in the device's space (logged out) the shelf is
// off, lists nothing and no own image is shown anywhere.
//
//   store `lookImages` (keyPath `id`) of the current space's database, one
//   row per image, the sync item as it is (src/cloud/sync/items.ts
//   `lookImageSpec`): { id, label, webp (base64), created }
//
// - `id` is random (base64url of 16 bytes) and never changes; a look names
//   it (`{src: 'own', id}`).
// - A picture is shown from a `data:` URL made from the stored base64 (the
//   app's CSP allows no `blob:`), cached for the page's life; the map worker
//   gets its bytes, once (src/map/tokens-feed.ts `ownBytes`).
// - An own image is never sent to anyone else: nothing here leaves the
//   device but through the account's encrypted sync.
// - The rows are loaded once; a pulled change (the sync wrote the store,
//   in this tab or another of the space) is read again at once, also during
//   play (`onSynced`).

import { STORE, idbDone, idbRequest } from '../core/db';
import { noteStored, onSynced } from '../core/store-events';
import type { FullReason } from '../cloud/sync/types';

export interface OwnImage {
  id: string;
  label: string;
  /** The picture's bytes in base64 (WebP; JPEG where the browser makes no WebP). */
  webp: string;
  created: number;
}

/** An own image's id: base64url of 16 random bytes (src/cloud/sync/items.ts `LOOK_IMAGE_ID`). */
export function newImageId(rand: (n: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) => crypto.getRandomValues(b)): string {
  const b = rand(new Uint8Array(16));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes as base64 (standard alphabet, padded). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Base64 as bytes. */
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** The picture's type from its first bytes in base64: WebP (`RIFF`), JPEG, PNG; WebP when unknown. */
export function imageMime(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  return 'image/webp';
}

/** A clean row from anything (bad rows are not shown). */
function rowOf(x: unknown): OwnImage | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Partial<OwnImage>;
  if (typeof r.id !== 'string' || r.id === '' || typeof r.webp !== 'string' || r.webp === '' || typeof r.created !== 'number') return null;
  return { id: r.id, label: typeof r.label === 'string' ? r.label : '', webp: r.webp, created: r.created };
}

export interface OwnImagesOptions {
  /** The current space's database; absent or rejecting: kept in memory. */
  openDb?: (() => Promise<IDBDatabase>) | null;
  /** The shelf is on: the page is in an account's space. Off: nothing is loaded, listed or shown. */
  enabled: boolean;
  now?: () => number;
}

export class OwnImages {
  readonly enabled: boolean;
  private rows: OwnImage[] = [];
  private idSet: ReadonlySet<string> = new Set();
  private readonly srcs = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly openDb: (() => Promise<IDBDatabase>) | null;
  private readonly now: () => number;
  private readonly off: () => void;
  /** Resolves when the stored rows have been read (or could not be). */
  readonly ready: Promise<void>;
  /** Bumped on every change. */
  version = 0;

  constructor(o: OwnImagesOptions) {
    this.enabled = o.enabled;
    this.openDb = o.openDb ?? null;
    this.now = o.now ?? Date.now;
    this.ready = this.load();
    this.off = this.enabled ? onSynced((kind) => kind === 'lookImage' && void this.load()) : () => {};
  }

  private async load(): Promise<void> {
    if (!this.enabled || !this.openDb) return;
    try {
      const db = await this.openDb();
      const t = db.transaction(STORE.lookImages, 'readonly');
      const done = idbDone(t);
      const raw = (await idbRequest(t.objectStore(STORE.lookImages).getAll())) as unknown[];
      await done;
      this.set(raw.map(rowOf).filter((r): r is OwnImage => r !== null));
    } catch {
      // No database: what is in memory stays.
    }
  }

  private set(rows: OwnImage[]): void {
    rows.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ids = new Set(rows.map((r) => r.id));
    for (const id of [...this.srcs.keys()]) if (!ids.has(id)) this.srcs.delete(id);
    // A row whose picture changed (a last writer from another device) makes its URL again.
    for (const r of rows) {
      const old = this.rows.find((x) => x.id === r.id);
      if (old && old.webp !== r.webp) this.srcs.delete(r.id);
    }
    this.rows = rows;
    this.idSet = ids;
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  /** The ids on the shelf (the resolver's `ownImages`), or null when the shelf is off. */
  ids(): ReadonlySet<string> | null {
    return this.enabled ? this.idSet : null;
  }

  /** The images, oldest first. */
  list(): readonly OwnImage[] {
    return this.enabled ? this.rows : [];
  }

  get(id: string): OwnImage | null {
    return (this.enabled && this.rows.find((r) => r.id === id)) || null;
  }

  /** The picture as a `data:` URL (cached), or null. */
  src(id: string): string | null {
    const r = this.get(id);
    if (!r) return null;
    let s = this.srcs.get(id);
    if (!s) {
      s = `data:${imageMime(r.webp)};base64,${r.webp}`;
      this.srcs.set(id, s);
    }
    return s;
  }

  /** The picture's bytes (for the map worker), or null. */
  bytes(id: string): ArrayBuffer | null {
    const r = this.get(id);
    return r ? fromBase64(r.webp).buffer : null;
  }

  /** Puts a new image on the shelf (`bytes`: the encoded picture). Rejects when the shelf is off. */
  async add(bytes: Uint8Array, label: string): Promise<OwnImage> {
    if (!this.enabled) throw new Error('own images need an account');
    const img: OwnImage = { id: newImageId(), label: label.slice(0, 60), webp: toBase64(bytes), created: this.now() };
    this.set([...this.rows, img]);
    await this.write((os) => os.put(img));
    return img;
  }

  /** Takes an image off the shelf. */
  async remove(id: string): Promise<void> {
    if (!this.enabled || !this.idSet.has(id)) return;
    this.set(this.rows.filter((r) => r.id !== id));
    await this.write((os) => os.delete(id));
  }

  private async write(fn: (os: IDBObjectStore) => void): Promise<void> {
    if (!this.openDb) return;
    try {
      const db = await this.openDb();
      const t = db.transaction(STORE.lookImages, 'readwrite');
      fn(t.objectStore(STORE.lookImages));
      await idbDone(t);
      noteStored('lookImage');
    } catch {
      // Kept in memory for this page.
    }
  }

  /**
   * The images the account refused (a push answered 413, ADR 0151 `full`),
   * by id with the reason: they stay on this device and are tried again.
   */
  async refused(): Promise<Map<string, FullReason>> {
    const out = new Map<string, FullReason>();
    if (!this.enabled || !this.openDb) return out;
    try {
      const db = await this.openDb();
      const t = db.transaction(STORE.sync, 'readonly');
      const done = idbDone(t);
      const rows = (await idbRequest(t.objectStore(STORE.sync).getAll())) as { kind?: string; rec?: { key?: string | null; state?: string; full?: FullReason } }[];
      await done;
      for (const r of rows) {
        const rec = r.rec;
        if (r.kind === 'lookImage' && rec?.key && rec.state === 'full') out.set(rec.key, rec.full ?? 'storage_full');
      }
    } catch {
      // Nothing known.
    }
    return out;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose(): void {
    this.off();
    this.listeners.clear();
  }
}
