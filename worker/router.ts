// The Worker's request router (spec §7.1, ADR 0144). Plain `Request` in,
// `Response` out; the bindings come through `env` as small interfaces of
// our own (runtime.ts), so scripts/static-server.ts runs this same code
// under Node (its `cloudflare` profile) with only an assets stub: there is
// no database there, so the beat answers 503 and the flags are off.
//
//   GET  /api/health          { ok, version, commit } of the deployed build
//   GET  /api/config          { flags, turnstileSiteKey, limits, time }
//                             (max-age 60)
//   /api/auth/*, /api/u/*     the accounts (worker/auth.ts; flag `accounts`)
//   POST /api/beat            a usage beat (ADR 0147); 204
//   GET  /api/stats/public    { online, playing } (public, max-age 60)
//   GET  /api/admin/stats     the admin page's numbers (Access)
//   PUT  /api/admin/flags/<n> { value } (Access, X-WC: 1, same Origin)
//   GET  /admin               the admin page (Access); /admin/admin.css,
//                             /admin/admin.js
//   other /api/*              404 { error: "not_found" }; a wrong method is
//                             405 { error: "method_not_allowed" }
//   anything else             the static assets (only reached when no file
//                             matched and the request is not a navigation:
//                             a 404)
//
// API conventions (spec §7.1): JSON, errors as { error: "<code>" } with a
// fitting status, `no-store` unless a route says otherwise. `_headers`
// does not apply to what a Worker answers, so the API sets its own headers
// here; on staging (`NOINDEX`) every answer of the Worker gets
// `X-Robots-Tag: noindex`.

import { type AdminFlag, type Config, DEFAULT_ACCOUNT_LIMITS, type Health, type PublicStats } from '../shared/cloud/api.ts';
import { verifyAccess } from './access.ts';
import { ADMIN_CSP, ADMIN_CSS, ADMIN_HTML, ADMIN_JS } from './admin/page.ts';
import { accountApi, isAccountPath, sameSite } from './auth.ts';
import { adminFlags, flags, isFlagName, setFlag } from './flags.ts';
import { DEFAULT_DEPS, type Deps, type Env, error, json, truthy } from './runtime.ts';
import { MAX_BEAT_BYTES, adminStats, parseBeat, publicStats, readCapped, recordBeat } from './stats.ts';

export { API_HEADERS } from './runtime.ts';
export type { AssetsBinding, Env } from './runtime.ts';

/**
 * Version and commit of the deployed build: the site's own `release.json`
 * (ADR 0025), read through the assets binding, so the API and the client's
 * update check have one source. `dev` for both when there is none (a
 * Worker started without a build).
 */
export async function release(env: Env, origin: string): Promise<{ version: string; commit: string }> {
  try {
    const res = await env.ASSETS.fetch(new URL('/release.json', origin));
    if (res.ok) {
      const r = (await res.json()) as { version?: unknown; commit?: unknown } | null;
      if (r && typeof r.version === 'string' && typeof r.commit === 'string') return { version: r.version, commit: r.commit };
    }
  } catch {
    // Not a build: fall through.
  }
  return { version: 'dev', commit: 'dev' };
}

type Handler = (request: Request, env: Env, url: URL, deps: Deps) => Response | Promise<Response>;

const MINUTE_CACHE = { 'Cache-Control': 'max-age=60' };
const PUBLIC_MINUTE_CACHE = { 'Cache-Control': 'public, max-age=60' };

async function beat(request: Request, env: Env, _url: URL, deps: Deps): Promise<Response> {
  const db = env.DB;
  if (!db) return error('unavailable', 503);
  const now = deps.now();
  if (!(await flags(env, now)).stats) return error('not_found', 404);
  if (env.BEAT_LIMITER) {
    // The address is the limiter's key and nothing else: never stored or logged.
    const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.BEAT_LIMITER.limit({ key });
    if (!success) return error('rate_limited', 429);
  }
  const text = await readCapped(request, MAX_BEAT_BYTES);
  let body: unknown = null;
  try {
    body = text === null ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  const b = parseBeat(body);
  if (!b) return error('bad_request', 400);
  try {
    await recordBeat(db, b, now);
  } catch {
    return error('unavailable', 503);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function statsPublic(_request: Request, env: Env, _url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  if (!(await flags(env, now)).stats) return error('not_found', 404);
  if (!env.DB) return error('unavailable', 503);
  try {
    return json((await publicStats(env.DB, now)) satisfies PublicStats, 200, PUBLIC_MINUTE_CACHE);
  } catch {
    return error('unavailable', 503);
  }
}

/**
 * `GET /api/config`: the flags, and what the account pages need before a
 * login: the Turnstile site key (public by its nature), the default
 * limits and the server's time (as old as the cache lets it be).
 */
async function config(_request: Request, env: Env, _url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  const answer: Required<Config> = {
    flags: await flags(env, now),
    turnstileSiteKey: typeof env.TURNSTILE_SITE_KEY === 'string' ? env.TURNSTILE_SITE_KEY : '',
    limits: DEFAULT_ACCOUNT_LIMITS,
    time: now,
  };
  return json(answer, 200, MINUTE_CACHE);
}

/** The API's routes: path → method → handler. */
const ROUTES: Record<string, Record<string, Handler>> = {
  '/api/health': {
    GET: async (_request, env, url) => json({ ok: true, ...(await release(env, url.origin)) } satisfies Health),
  },
  '/api/config': {
    GET: config,
  },
  '/api/beat': { POST: beat },
  '/api/stats/public': { GET: statsPublic },
};

// --- Admin (behind Cloudflare Access and access.ts) ---

const ADMIN_FILES: Record<string, { type: string; body: string }> = {
  '/admin': { type: 'text/html; charset=utf-8', body: ADMIN_HTML },
  '/admin/': { type: 'text/html; charset=utf-8', body: ADMIN_HTML },
  '/admin/admin.css': { type: 'text/css; charset=utf-8', body: ADMIN_CSS },
  '/admin/admin.js': { type: 'text/javascript; charset=utf-8', body: ADMIN_JS },
};

const ADMIN_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': ADMIN_CSP,
};

function adminFile(_request: Request, _env: Env, url: URL): Response {
  const f = ADMIN_FILES[url.pathname];
  return f ? new Response(f.body, { headers: { ...ADMIN_HEADERS, 'Content-Type': f.type } }) : error('not_found', 404);
}

async function adminStatsRoute(_request: Request, env: Env, _url: URL, deps: Deps): Promise<Response> {
  if (!env.DB) return error('unavailable', 503);
  return json(await adminStats(env, env.DB, deps.now()));
}

async function adminFlagRoute(request: Request, env: Env, url: URL, deps: Deps): Promise<Response> {
  const name = url.pathname.slice('/api/admin/flags/'.length);
  if (!isFlagName(name)) return error('not_found', 404);
  if (!sameSite(request, url)) return error('forbidden', 403);
  if (!env.DB) return error('unavailable', 503);
  const text = await readCapped(request, 256);
  let body: unknown;
  try {
    body = text === null ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  const keys = typeof body === 'object' && body !== null ? Object.keys(body) : [];
  const value = (body as { value?: unknown } | null)?.value;
  if (keys.length !== 1 || typeof value !== 'boolean') return error('bad_request', 400);
  await setFlag(env.DB, name, value);
  return json((await adminFlags(env, deps.now()))[name] satisfies AdminFlag);
}

/** The admin's routes: path (or prefix ending in '/') → method → handler. */
const ADMIN_ROUTES: Record<string, Record<string, Handler>> = {
  '/admin': { GET: adminFile },
  '/admin/': { GET: adminFile },
  '/admin/admin.css': { GET: adminFile },
  '/admin/admin.js': { GET: adminFile },
  '/api/admin/stats': { GET: adminStatsRoute },
  '/api/admin/flags/': { PUT: adminFlagRoute },
};

function isAdmin(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
}

function adminRoute(path: string): Record<string, Handler> | undefined {
  if (Object.hasOwn(ADMIN_ROUTES, path)) return ADMIN_ROUTES[path];
  if (path.startsWith('/api/admin/flags/') && path.length > '/api/admin/flags/'.length) return ADMIN_ROUTES['/api/admin/flags/'];
  return undefined;
}

async function dispatch(request: Request, env: Env, url: URL, deps: Deps, route: Record<string, Handler> | undefined): Promise<Response> {
  if (!route) return error('not_found', 404);
  // HEAD is GET without the body, as for the static files.
  const head = request.method === 'HEAD';
  const method = head ? 'GET' : request.method;
  const handler = Object.hasOwn(route, method) ? route[method] : undefined;
  if (!handler) return error('method_not_allowed', 405, { Allow: Object.keys(route).join(', ') });
  const res = await handler(request, env, url, deps);
  return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (isAdmin(path)) {
    // Every admin path, known or not, answers only after the Access check.
    const access = await verifyAccess(request, env, deps);
    if (!access.ok) return access.response;
    return dispatch(request, env, url, deps, adminRoute(path));
  }
  if (path !== '/api' && !path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (isAccountPath(path)) return accountApi(request, env, url, deps);
  return dispatch(request, env, url, deps, Object.hasOwn(ROUTES, path) ? ROUTES[path] : undefined);
}

export async function handle(request: Request, env: Env, deps: Deps = DEFAULT_DEPS): Promise<Response> {
  const res = await route(request, env, deps);
  if (!truthy(env.NOINDEX)) return res;
  // An answer of the assets binding has immutable headers: copy it.
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
}
