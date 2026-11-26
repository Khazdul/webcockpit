// The token library at run time (stage 80 §2, ADR 0170): the manifest's
// lazy load and the pictures' URLs.
//
// - Nothing loads on a normal start: the manifest is fetched the first time
//   the picker opens or a look needs it (`loadLibrary`), once per page (a
//   failure may be tried again later). A picture loads when it is shown.
// - The manifest's URL carries the release (`?v=`): `/tokens/*` is cached a
//   year (public/_headers), and the manifest grows with a new picture.
// - URLs are `'self'` (the CSP's img-src), never `blob:`.
// - The replay bundle (`__WC_REPLAY__`: the exported HTML file, the share
//   frame) has no network: there `loadLibrary` never fetches and resolves
//   to null, and the resolver draws no looks (resolve.ts).

import { CLIENT_VERSION } from '../core/build-info';
import { type LibraryEntry, type LibraryManifest, TOKEN_ID_RE } from './library-types';

export type { LibraryEntry, LibraryManifest };

declare const __WC_REPLAY__: boolean | undefined;
/** The replay bundle: no looks, no fetch. */
export const IN_REPLAY = typeof __WC_REPLAY__ === 'boolean' && __WC_REPLAY__;

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** The 256 px picture (the portrait frame) or the 128 px one (tokens, the grid). */
export const tokenUrl = (id: string, size: 'p' | 't', base = BASE): string => `${base}tokens/${size}/${id}.webp`;

export const manifestUrl = (base = BASE, version = CLIENT_VERSION): string => `${base}tokens/tokens.json?v=${encodeURIComponent(version)}`;

/** The manifest with its entries by id. */
export interface Library {
  readonly tokens: readonly LibraryEntry[];
  readonly byId: ReadonlyMap<string, LibraryEntry>;
  has(id: string): boolean;
}

export function libraryOf(m: { tokens: readonly LibraryEntry[] }): Library {
  const tokens = m.tokens.filter((t) => t && typeof t.id === 'string' && TOKEN_ID_RE.test(t.id));
  const byId = new Map(tokens.map((t) => [t.id, t] as const));
  return { tokens, byId, has: (id) => byId.has(id) };
}

let loaded: Library | null = null;
let loading: Promise<Library | null> | null = null;
const waiting = new Set<(lib: Library) => void>();

/** The manifest when it has loaded, else null (and no load is started). */
export const libraryNow = (): Library | null => loaded;

/** Calls `fn` when the manifest has loaded (at once if it has). Returns the unsubscribe. */
export function onLibrary(fn: (lib: Library) => void): () => void {
  if (loaded) {
    fn(loaded);
    return () => {};
  }
  waiting.add(fn);
  return () => waiting.delete(fn);
}

/** Loads the manifest once (the replay bundle: never, null). A failure resolves to null and may be tried again. */
export function loadLibrary(fetchFn: typeof fetch | null = typeof fetch === 'function' ? fetch : null): Promise<Library | null> {
  if (IN_REPLAY || !fetchFn) return Promise.resolve(null);
  if (loaded) return Promise.resolve(loaded);
  loading ??= fetchFn(manifestUrl(), { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<LibraryManifest>) : null))
    .then((m) => {
      if (!m || !Array.isArray(m.tokens)) throw new Error('no manifest');
      loaded = libraryOf(m);
      for (const fn of [...waiting]) fn(loaded);
      waiting.clear();
      return loaded;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

/** Tests: forget the loaded manifest. */
export function resetLibrary(lib: Library | null = null): void {
  loaded = lib;
  loading = null;
  waiting.clear();
}
