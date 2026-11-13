// The release manifest (ADR 0025, ADR 0028): `release.json` at the root of
// the published site. `npm run build:site` writes it; the next build reads
// the live one to know what to carry over, and the running app's update
// check compares `version` and `commit` with its own.

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

/**
 * The version rule of a release (ADR 0025): every release carries a new
 * package.json version, so a running tab can tell that the live site
 * changed. Why the build `next` may not go out over the live release
 * `live` (null = no live release), or null when it may.
 *
 * The live commit under the live version is that release again and is
 * allowed: while GitHub Pages and Cloudflare are both deployed from one
 * tag (ADR 0144), the slower workflow finds the release already live, and
 * a failed deploy can be run again. Commits are abbreviated hashes whose
 * length git chooses per checkout, so one being the start of the other
 * is the same commit.
 */
export function versionGuard(live: Pick<Release, 'version' | 'commit'> | null, next: Pick<Release, 'version' | 'commit'>): string | null {
  if (live === null || live.version !== next.version) return null;
  const [a, b] = [live.commit, next.commit];
  if (a !== '' && b !== '' && (a.startsWith(b) || b.startsWith(a))) return null;
  return (
    `version ${next.version} is already live (commit ${live.commit}, this is ${next.commit}). Bump it and commit first, e.g.\n` +
    `  npm version patch --no-git-tag-version && git commit -am "chore: version <new version>"`
  );
}
