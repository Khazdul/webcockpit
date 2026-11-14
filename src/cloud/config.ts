// The cloud client's ground rules (spec §7.0, ADR 0147): the server's flags
// (`GET /api/config`) and when the client may talk to the API at all.
//
// The flags are fetched once per page load, with a short timeout, and
// nothing on the game path waits for them: every caller is itself started
// on idle time (src/cloud/start.ts, src/chrome/start-online.ts). Any
// failure (no API: the dev server without `dev:cloud`, GitHub Pages, the
// service down; a timeout; an answer that is not the contract's) is
// "all flags off", silently.
//
// Automated browsers (`navigator.webdriver`: our e2e, `test:prod`) make no
// API request at all, so the tests neither count nor depend on the
// service. The one way past that is `?cloudtest`, honoured only on the dev
// server (`import.meta.env.DEV`; a production build folds it to false):
// the e2e specs of the cloud client set it and stub `/api/*` with
// Playwright's `page.route` (tests/e2e/cloud-stats.spec.ts).

import type { Config, FlagName } from '../../shared/cloud/api.ts';

/** The API's requests give up after this long (ms). */
export const CLOUD_TIMEOUT_MS = 4000;

/** The part of `fetch` the cloud client uses (globalThis.fetch fits). */
export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Dev server only: the e2e specs of the cloud client run it under webdriver (`?cloudtest`). */
export function cloudTest(search: string = globalThis.location?.search ?? ''): boolean {
  return import.meta.env.DEV === true && new URLSearchParams(search).has('cloudtest');
}

/** An automated browser (Playwright, WebDriver): no API request, unless `cloudTest`. */
export function automated(nav: { webdriver?: boolean } | undefined = globalThis.navigator): boolean {
  return nav?.webdriver === true;
}

/** True when this page may call the API at all (not under webdriver, unless the dev test hook). */
export function apiAllowed(): boolean {
  return cloudTest() || !automated();
}

/** `GET /api/config`'s body as a `Config`: only boolean flags are kept; anything else is no flags. */
export function parseConfig(data: unknown): Config {
  const flags: Config['flags'] = {};
  if (!data || typeof data !== 'object') return { flags };
  const raw = (data as { flags?: unknown }).flags;
  if (!raw || typeof raw !== 'object') return { flags };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') (flags as Record<string, boolean>)[k] = v;
  }
  return { flags };
}

/** A JSON GET of the API: the parsed body, or null on any failure (never rejects). */
export async function getJson(url: string, fetchFn: FetchLike | undefined = globalThis.fetch?.bind(globalThis)): Promise<unknown> {
  if (!fetchFn) return null;
  try {
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(CLOUD_TIMEOUT_MS) : undefined;
    const res = await fetchFn(url, { credentials: 'omit', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Fetches the flags (never rejects; no flags on failure). */
export async function fetchConfig(fetchFn?: FetchLike, url = '/api/config'): Promise<Config> {
  return parseConfig(await getJson(url, fetchFn));
}

let cached: Promise<Config> | null = null;

/** The flags of this page load: fetched on the first call, then the same answer. No flags when the API is not allowed. */
export function config(): Promise<Config> {
  cached ??= apiAllowed() ? fetchConfig() : Promise.resolve({ flags: {} });
  return cached;
}

/** True when the server has flag `name` on (false on any failure). */
export async function flagOn(name: FlagName): Promise<boolean> {
  return (await config()).flags[name] === true;
}

/** Tests: forget the fetched flags. */
export function resetConfigForTest(): void {
  cached = null;
}

/**
 * Runs `go` when the page is idle (at most `timeout` ms later), so the cloud
 * client never competes with the cold start or a frame (spec §7.0 rule 1).
 */
export function whenIdle(go: () => void, timeout = 3000): void {
  const ric = globalThis.requestIdleCallback;
  if (typeof ric === 'function') ric(go, { timeout });
  else setTimeout(go, 500);
}
