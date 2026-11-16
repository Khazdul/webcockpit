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

/** An R2 object's head, as far as the Worker reads it. */
export interface R2Head {
  key: string;
  size: number;
}

/** An R2 object with its body. */
export interface R2Body extends R2Head {
  body: ReadableStream<Uint8Array>;
}

/** The R2 binding (`FILES`), as far as the Worker uses it. */
export interface R2 {
  /** Stores `value` under `key` (R2 needs its length known: a FixedLengthStream, or bytes). */
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2Head | null>;
  get(key: string): Promise<R2Body | null>;
  head(key: string): Promise<R2Head | null>;
  /** Up to 1000 keys at once. */
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: R2Head[]; truncated: boolean; cursor?: string }>;
}

/** The Workers rate limiting binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * The `send_email` binding (wrangler.jsonc `REPORT_MAIL`, worker/mail.ts).
 * `message` is what `Deps.emailMessage` made (a `cloudflare:email`
 * EmailMessage on the real Worker).
 */
export interface MailBinding {
  send(message: unknown): Promise<unknown>;
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
  /** The default of the flag `sync` (stage 61). Off: `/api/u/sync/*` answers 404. */
  FLAG_SYNC?: boolean | string;
  /** The default of the flag `runs` (stage 63). Off: `/api/u/runs*` answers 404 and the kinds `run` and `exportDoc` stay closed. */
  FLAG_RUNS?: boolean | string;
  /** The default of the flag `share` (stage 64). Off: the publication paths answer 404. */
  FLAG_SHARE?: boolean | string;
  /** The default of the flag `gallery` (stage 65, ADR 0155): listing, the Community, stars, comments, the counters. */
  FLAG_GALLERY?: boolean | string;
  /** The default of the flag `runes` (stage 65): Random Runes (needs `gallery`). */
  FLAG_RUNES?: boolean | string;
  /** R2 `webcockpit` / `webcockpit-staging`: the run bodies (stage 63). Without it the run endpoints answer 503. */
  FILES?: R2;
  /** The default `runBytes` limit of an account, in bytes (a whole number). Unset: DEFAULT_ACCOUNT_LIMITS. */
  RUN_BYTES_LIMIT?: number | string;
  /** The limit on `/api/auth/*` and `/api/u/*`, keyed by address and by session. Without it: no limit. */
  API_LIMITER?: RateLimiter;
  /** The limit on a search, `GET /api/gallery?q=`, keyed by address (review fix 2 R2-1). Without it: no limit. */
  SEARCH_LIMITER?: RateLimiter;
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
  /** `send_email` (ADR 0154, "mail on reports"): the owner's mail on each report. Without it: no mail. */
  REPORT_MAIL?: MailBinding;
  /** A secret: the owner's address, a verified destination of Email Routing. Without it: no mail. */
  REPORT_MAIL_TO?: string;
  /** The sender, on the zone with Email Routing. Unset: reports@mumecockpit.com. */
  REPORT_MAIL_FROM?: string;
  /** The site's origin for the links in a mail (`https://mumecockpit.com`). Unset: the request's origin. */
  SITE_ORIGIN?: string;
}

/** What the Worker's own requests set (worker/turnstile.ts). */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * A TCP socket as `cloudflare:sockets`' `connect()` returns it, as far as
 * worker/mume.ts uses it (the MSSP probe).
 */
export interface TcpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}

/** The clock and the network, replaceable by tests. */
export interface Deps {
  now(): number;
  fetch(input: string, init?: FetchInit): Promise<Response>;
  /**
   * Work that goes on after the answer (the request's
   * `ctx.waitUntil`). Without it the work runs unawaited.
   */
  waitUntil?(work: Promise<unknown>): void;
  /** Waits `ms` (a timer); tests replace it. Without it: setTimeout. */
  sleep?(ms: number): Promise<void>;
  /**
   * Makes the message `REPORT_MAIL.send` takes from a raw RFC 5322 text:
   * worker/index.ts hands over `cloudflare:email`'s EmailMessage (the
   * router does not import it, so it still runs under Node). Without it:
   * no mail.
   */
  emailMessage?(from: string, to: string, raw: string): unknown;
  /**
   * Opens a plain TCP connection: worker/index.ts hands over
   * `cloudflare:sockets`' `connect()` (the router does not import it, as
   * with `emailMessage`). Without it: no MSSP probe (worker/mume.ts).
   */
  connect?(address: { hostname: string; port: number }): TcpSocket;
  /**
   * The Cache API's `caches.default` (worker/index.ts hands it over): the
   * public community answers are kept in it for 60 s (stage 65, ADR 0155).
   * Without it (the static server under Node, the tests) every request
   * reads the database.
   */
  cache?: CacheLike;
}

/** What the Worker uses of a Cache API cache. */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export const DEFAULT_DEPS: Deps = {
  now: () => Date.now(),
  fetch: (input, init) => fetch(input, init),
};

/**
 * The internal header by which a handler of `/api/u/*` or `/api/admin/*`
 * says its write changed what the public reads show; worker/router.ts
 * takes it off and moves the mark (review fix 2 R2-2: only a real change).
 */
export const PUBLIC_CHANGE_HEADER = 'X-WC-Public-Change';

/**
 * `res`, marked as a change of what the public reads show. `now`: the mark
 * moves at once, not held by the few seconds between marks: for changes
 * that are bounded by a daily limit or are the admin's (a run listed for
 * the first time, a listed run removed, Delete account, moderation).
 */
export function publicChange(res: Response, now = false): Response {
  res.headers.set(PUBLIC_CHANGE_HEADER, now ? 'now' : '1');
  return res;
}

/** Runs `work` after the answer (Deps.waitUntil); it never throws into the caller. */
export function later(deps: Deps, work: Promise<unknown>): void {
  const safe = work.catch(() => undefined);
  if (deps.waitUntil) deps.waitUntil(safe);
}

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

/**
 * A query parameter from a fixed list (review fix CR7: one for every
 * route): absent or empty → `fallback`; one of `list` → it; anything else
 * → null (the caller answers 400).
 */
export function oneOf<T extends string>(list: readonly T[], v: string | null, fallback: T): T | null {
  if (v === null || v === '') return fallback;
  return (list as readonly string[]).includes(v) ? (v as T) : null;
}

/** Whether a value of a body is one of a fixed list of strings. */
export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
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
