// What the router uses of the Workers runtime, as small interfaces of its
// own: the root project type-checks the router through
// scripts/static-server.ts without the Workers types, and the static
// server runs it under Node with no database at all (ADR 0144, "As
// built"). The real bindings (D1Database, RateLimit, Fetcher) fit these
// shapes; worker/index.ts hands them over as they are.

/** The static assets binding (`assets.binding` in wrangler.jsonc). */
export interface AssetsBinding {
  fetch(input: Request | URL | string): Promise<Response>;
}

/** What a D1 statement's `run()` reports (rows read and written by it). */
export interface D1Meta {
  rows_read?: number;
  rows_written?: number;
  changes?: number;
}

export interface D1Result<T> {
  results: T[];
  meta: D1Meta;
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

/** The D1 binding (`DB`), as far as the router uses it. */
export interface D1 {
  prepare(sql: string): D1Statement;
  /** The statements in one transaction. */
  batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}

/** The Workers rate limiting binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * The Worker's environment: bindings, vars and secrets of wrangler.jsonc.
 * Everything but the assets is optional, so a host without them (the
 * static server, a test) gets the answers of a service that is down or
 * not configured.
 */
export interface Env {
  ASSETS: AssetsBinding;
  /** D1 `webcockpit` / `webcockpit-staging`. Without it: 503 `unavailable`. */
  DB?: D1;
  /** The limit on `POST /api/beat`, keyed by address. Without it: no limit. */
  BEAT_LIMITER?: RateLimiter;
  /** The default of the flag `stats` (a var: true, "true", "on" or "1" is on). */
  FLAG_STATS?: boolean | string;
  /** Cloudflare Access: the team domain (`<team>.cloudflareaccess.com`). */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access: the application's audience tag. */
  ACCESS_AUD?: string;
  /** A secret: the e-mail addresses that may use the admin page, comma separated. */
  ADMIN_EMAILS?: string;
  /** Staging: every answer of the Worker carries `X-Robots-Tag: noindex`. */
  NOINDEX?: boolean | string;
  /** The default of the flag `accounts`. Off: `/api/auth/*` and `/api/u/*` answer 404. */
  FLAG_ACCOUNTS?: boolean | string;
  /** The limit on `/api/auth/*` and `/api/u/*`, keyed by address and by session. Without it: no limit. */
  API_LIMITER?: RateLimiter;
  /** The tight limit on `POST /api/auth/login`, `/recover` and `/register`, keyed by address. Without it: no limit. */
  AUTH_LIMITER?: RateLimiter;
  /**
   * A secret (at least 16 characters): the fake salts, the attempt
   * counters' keys and the day's address pepper are derived from it.
   * Without it the account endpoints answer 503 `accounts_not_configured`.
   */
  AUTH_PEPPER?: string;
  /** A secret: the Turnstile widget's secret key. Without it: 503 `accounts_not_configured`. */
  TURNSTILE_SECRET?: string;
  /** The Turnstile widget's site key, handed to the client by `/api/config`. */
  TURNSTILE_SITE_KEY?: string;
  /** Host names a passed Turnstile challenge may come from, comma separated. Unset: any (the test keys say `example.com`). */
  TURNSTILE_HOSTNAMES?: string;
}

/** What the Worker's own requests set (worker/turnstile.ts). */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/** The clock and the network, replaceable by tests. */
export interface Deps {
  now(): number;
  fetch(input: string, init?: FetchInit): Promise<Response>;
}

export const DEFAULT_DEPS: Deps = {
  now: () => Date.now(),
  fetch: (input, init) => fetch(input, init),
};

/** A var that means on: true, "true", "on", "1" (any case). */
export function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return typeof v === 'string' && ['true', 'on', '1'].includes(v.trim().toLowerCase());
}

export const API_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
}

export function error(code: string, status: number, extra: Record<string, string> = {}): Response {
  return json({ error: code }, status, extra);
}

/** The UTC day of a time: 'YYYY-MM-DD'. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Midnight UTC of a day. */
export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export const DAY_MS = 86_400_000;
