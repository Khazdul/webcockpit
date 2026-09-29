// Update check (ADR 0025): is the site serving a newer build than the one
// running in this tab?
//
// `npm run publish` writes `release.json` ({ version, commit, … }) at the
// site root (under Vite's `base`, `/webcockpit/` on GitHub Pages: ADR 0028),
// and every build emits one too (vite.config.ts). The checker fetches it
// with `cache: 'no-store'`, compares it with the running build
// (src/core/build-info.ts) and calls `onNewVersion` once per different
// release. Failures (offline, 404, bad JSON) are silent.
//
// This module is pure: fetch and the clock are injected. The page wiring
// (when to check) is src/app/notices-wiring.ts. Nothing here ever reloads.

/** The part of `release.json` the check compares. */
export interface ReleaseInfo {
  version: string;
  commit: string;
}

/** The minimal fetch the checker needs (globalThis.fetch fits). */
export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface UpdateCheckerOptions {
  /** The running build. */
  current: ReleaseInfo;
  fetch: FetchLike;
  /** Wall clock in ms. */
  now: () => number;
  /** Called once per release that differs from `current`. */
  onNewVersion: (served: ReleaseInfo) => void;
  /** Where the manifest is (default `<base>release.json`, Vite's `base`: ADR 0028). */
  url?: string;
  /** At most one check per this many ms, unless forced (default 60 s). */
  minIntervalMs?: number;
}

/** Default throttle: one check a minute. */
export const MIN_CHECK_INTERVAL_MS = 60_000;

/** A commit that says nothing about the build (dev server, no git). */
const UNKNOWN_COMMIT = new Set(['', 'dev']);

/** `release.json` → ReleaseInfo, or null when it is not one. */
export function parseRelease(data: unknown): ReleaseInfo | null {
  if (!data || typeof data !== 'object') return null;
  const { version, commit } = data as { version?: unknown; commit?: unknown };
  if (typeof version !== 'string' || !version) return null;
  return { version, commit: typeof commit === 'string' ? commit : '' };
}

/**
 * True when `served` is another build than `current`: another version, or
 * the same version from another commit (both commits known).
 */
export function isOtherRelease(current: ReleaseInfo, served: ReleaseInfo): boolean {
  if (served.version !== current.version) return true;
  if (UNKNOWN_COMMIT.has(current.commit) || UNKNOWN_COMMIT.has(served.commit)) return false;
  return served.commit !== current.commit;
}

export class UpdateChecker {
  private readonly o: UpdateCheckerOptions;
  private readonly minInterval: number;
  private lastCheck = -Infinity;
  private inFlight: Promise<ReleaseInfo | null> | null = null;
  private readonly announced = new Set<string>();
  private latestRelease: ReleaseInfo | null = null;

  constructor(o: UpdateCheckerOptions) {
    this.o = o;
    this.minInterval = o.minIntervalMs ?? MIN_CHECK_INTERVAL_MS;
  }

  /** The newest other release seen, or null. */
  get latest(): ReleaseInfo | null {
    return this.latestRelease;
  }

  /**
   * Fetches the manifest unless one was fetched less than the throttle
   * interval ago (`force` skips the throttle). Resolves to the other
   * release when the site serves one, else null. Never rejects.
   */
  check(force = false): Promise<ReleaseInfo | null> {
    if (this.inFlight) return this.inFlight;
    const t = this.o.now();
    if (!force && t - this.lastCheck < this.minInterval) return Promise.resolve(null);
    this.lastCheck = t;
    const p = this.fetchOnce().finally(() => {
      if (this.inFlight === p) this.inFlight = null;
    });
    this.inFlight = p;
    return p;
  }

  private async fetchOnce(): Promise<ReleaseInfo | null> {
    let served: ReleaseInfo | null;
    try {
      const res = await this.o.fetch(this.o.url ?? `${import.meta.env?.BASE_URL ?? '/'}release.json`, { cache: 'no-store' });
      if (!res.ok) return null;
      served = parseRelease(await res.json());
    } catch {
      return null;
    }
    if (!served || !isOtherRelease(this.o.current, served)) return null;
    this.latestRelease = served;
    const key = `${served.version} ${served.commit}`;
    if (!this.announced.has(key)) {
      this.announced.add(key);
      this.o.onNewVersion(served);
    }
    return served;
  }
}
