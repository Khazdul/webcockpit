// The release manifest (ADR 0022, ADR 0025): `release.json` at the root of
// a published site. `npm run publish` and `npm run build:pages` write it;
// the next publish reads it to know what to carry over, and the running
// app's update check compares `version` and `commit` with its own.

export const MANIFEST = 'release.json';

export interface Release {
  version: string;
  commit: string;
  dirty: boolean;
  publishedAt: string;
  /** Files under assets/ that this build produced (not carried over). */
  assets: string[];
}

/** The manifest of a new release, as written to `release.json`. */
export function releaseJson(r: Omit<Release, 'publishedAt'>, now = new Date()): string {
  const { version, commit, dirty, assets } = r;
  const release: Release = { version, commit, dirty, publishedAt: now.toISOString(), assets };
  return `${JSON.stringify(release, null, 2)}\n`;
}

/** A parsed `release.json`, or null when it is not one. */
export function parseRelease(text: string): Release | null {
  try {
    const r = JSON.parse(text) as Partial<Release> | null;
    if (!r || typeof r.version !== 'string' || typeof r.commit !== 'string') return null;
    const assets = Array.isArray(r.assets) ? r.assets.filter((a): a is string => typeof a === 'string') : [];
    return { version: r.version, commit: r.commit, dirty: r.dirty === true, publishedAt: String(r.publishedAt ?? ''), assets };
  } catch {
    return null;
  }
}

/** An asset name from a manifest that is safe to use as a file name under assets/. */
export function isAssetName(name: string): boolean {
  return /^[\w.-]+$/.test(name) && name !== '.' && name !== '..';
}
