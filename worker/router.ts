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
//   PUT  /api/admin/flags/<n> { value } (Access, X-WC: 1, same Origin; logged)
//   GET  /admin               the admin page (Access); /admin/admin.css,
//                             /admin/admin.js
//   /api/admin/reports, /pub/<id>[/payload], /account/<name>, /comment/<id>,
//   /note/<id>                moderation (worker/moderation.ts; Access, and
//                             X-WC: 1 and the same Origin on writes)
//   /api/admin/accounts, /account/<name>[/limits], /limits, /graphs, /log
//                             the admin panel (worker/panel.ts, stage 66; the same)
//   /api/pub/<id>[/payload|/view|/comments]
//                             a published run, public (worker/pub.ts; flag `share`;
//                             the comments `gallery` too)
//   GET  /api/gallery, /api/community, /api/runes
//                             the community, public (worker/community.ts; flags
//                             `share` and `gallery`, the board `runes` too)
//   /r/<id>                   the watch page: the site's index.html (the app
//                             boots into it); a static file under /r/ (the
//                             frame document) is served as it is
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

import { type AdminFlag, type Config, type Health, PUB_ID_PATTERN, type PublicStats } from '../shared/cloud/api.ts';
import { defaultLimits } from './accounts.ts';
import { verifyAccess } from './access.ts';
import { ADMIN_CSP, ADMIN_CSS, ADMIN_HTML, ADMIN_JS } from './admin/page.ts';
import { accountApi, isAccountPath, sameSite } from './auth.ts';
import { adminFlags, flagStatement, flags, forgetFlags, isFlagName } from './flags.ts';
import { sealedBatch } from './auditlog.ts';
import { loadLimitDefaults } from './limits.ts';
import { panelRoute } from './panel.ts';
import { DEFAULT_DEPS, type Deps, type Env, error, json, truthy } from './runtime.ts';
import { isModerationPath, moderationRoute, whoOf } from './moderation.ts';
import { afterWrite, communityPublic, isCommunityPublicPath, listedTimes } from './community.ts';
import { isPublicPubPath, publicPub } from './pub.ts';
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

/** `who`: on an admin path, the hash of the admin's Access e-mail (moderation.ts `whoOf`). */
type Handler = (request: Request, env: Env, url: URL, deps: Deps, who: string) => Response | Promise<Response>;

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

/**
 * `GET /api/stats/public`: online now (flag `stats`) and, with `gallery`
 * on, the times of the newest listed runs (the guests' counter, ADR 0155).
 * With `stats` off and `gallery` on it answers 0 online. The client reads
 * only `listed` since stage 65's feedback round 2 (the start page's
 * "N online" is gone; the owner's number is /admin's, `/api/admin/stats`);
 * `online` and `playing` stay in the contract, harmless.
 */
async function statsPublic(_request: Request, env: Env, _url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  const on = await flags(env, now);
  const gallery = on.gallery && on.share;
  if (!on.stats && !gallery) return error('not_found', 404);
  if (!env.DB) return error('unavailable', 503);
  try {
    const answer: PublicStats = on.stats ? await publicStats(env.DB, now) : { online: 0, playing: 0 };
    if (gallery) answer.listed = await listedTimes(env.DB);
    return json(answer, 200, PUBLIC_MINUTE_CACHE);
  } catch {
    return error('unavailable', 503);
  }
}

/**
 * `GET /api/config`: the flags, and what the account pages need before a
 * login: the Turnstile site key (public by its nature), the default
 * limits (with RUN_BYTES_LIMIT) and the server's time (as old as the cache lets it be).
 */
async function config(_request: Request, env: Env, _url: URL, deps: Deps): Promise<Response> {
  const now = deps.now();
  await loadLimitDefaults(env, now);
  const answer: Required<Config> = {
    flags: await flags(env, now),
    turnstileSiteKey: typeof env.TURNSTILE_SITE_KEY === 'string' ? env.TURNSTILE_SITE_KEY : '',
    limits: defaultLimits(env),
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

async function adminFlagRoute(request: Request, env: Env, url: URL, deps: Deps, who: string): Promise<Response> {
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
  // Stage 66: the switch is logged in the same transaction (ADR 0157). A
  // failing database, or the chain's retries run out, is 503 as for the
  // other admin writes (review fix S11); nothing was applied.
  const db = env.DB;
  try {
    await sealedBatch(env, db, { ts: deps.now(), who, action: value ? 'flag.on' : 'flag.off', target: name, note: '' }, (entry) => [flagStatement(db, name, value), entry]);
  } catch {
    return error('unavailable', 503);
  }
  forgetFlags(db);
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

export function adminRoute(path: string): Record<string, Handler> | undefined {
  if (Object.hasOwn(ADMIN_ROUTES, path)) return ADMIN_ROUTES[path];
  // Stage 66: the panel's routes (worker/panel.ts); `/api/admin/account/<name>`
  // has its GET there and its POST in moderation.ts.
  const panel = panelRoute(path);
  const moderation = isModerationPath(path) ? moderationRoute(path) : undefined;
  if (panel || moderation) return { ...moderation, ...panel };
  if (path.startsWith('/api/admin/flags/') && path.length > '/api/admin/flags/'.length) return ADMIN_ROUTES['/api/admin/flags/'];
  return undefined;
}

async function dispatch(request: Request, env: Env, url: URL, deps: Deps, route: Record<string, Handler> | undefined, who = ''): Promise<Response> {
  if (!route) return error('not_found', 404);
  // HEAD is GET without the body, as for the static files.
  const head = request.method === 'HEAD';
  const method = head ? 'GET' : request.method;
  const handler = Object.hasOwn(route, method) ? route[method] : undefined;
  if (!handler) return error('method_not_allowed', 405, { Allow: Object.keys(route).join(', ') });
  const res = await handler(request, env, url, deps, who);
  return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

/**
 * `res` after the community's mark is moved when the handler said its
 * write changed what the public reads show (stage 65, owner's feedback W4;
 * review fix 2 R2-2: only then, at most every few seconds, the put after
 * the answer).
 */
function written(url: URL, deps: Deps, res: Response): Response {
  return afterWrite(deps, url.origin, res);
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (isAdmin(path)) {
    // Every admin path, known or not, answers only after the Access check.
    const access = await verifyAccess(request, env, deps);
    if (!access.ok) return access.response;
    // The default limits (ADR 0157 pick 4b), for the panel's limits.
    await loadLimitDefaults(env, deps.now());
    return written(url, deps, await dispatch(request, env, url, deps, adminRoute(path), await whoOf(env, access.email)));
  }
  if (path.startsWith('/r/')) return watchPage(request, env, url);
  if (path !== '/api' && !path.startsWith('/api/')) return env.ASSETS.fetch(request);
  // (accountApi loads the default limits after its rate limit, before any handler checks one.)
  if (isAccountPath(path)) return written(url, deps, await accountApi(request, env, url, deps));
  if (isPublicPubPath(path)) return publicPub(request, env, url, deps);
  if (isCommunityPublicPath(path)) return communityPublic(request, env, url, deps);
  return dispatch(request, env, url, deps, Object.hasOwn(ROUTES, path) ? ROUTES[path] : undefined);
}

/**
 * `/r/*` (run_worker_first, ADR 0154): `/r/<id>` answers the site's
 * `index.html` (the root, fetched from the assets, so its `_headers`
 * policy and ETag come along) and the app boots into the watch page. A
 * path whose last part is not an id goes to the assets first, so a static
 * file under `/r/` (the frame document `/r/frame.html`, and the redirect
 * of `html_handling` to `/r/frame`) is served as it is; only what the
 * assets do not have becomes `index.html` (the app shows the error).
 */
async function watchPage(request: Request, env: Env, url: URL): Promise<Response> {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') return env.ASSETS.fetch(request);
  const id = url.pathname.slice('/r/'.length);
  if (!PUB_ID_PATTERN.test(id)) {
    const file = await env.ASSETS.fetch(request);
    if (file.status !== 404) return file;
  }
  const headers = new Headers();
  for (const name of ['if-none-match', 'if-modified-since', 'accept', 'accept-encoding']) {
    const v = request.headers.get(name);
    if (v !== null) headers.set(name, v);
  }
  return env.ASSETS.fetch(new Request(new URL('/', url), { method, headers }));
}

export async function handle(request: Request, env: Env, deps: Deps = DEFAULT_DEPS): Promise<Response> {
  const res = await route(request, env, deps);
  if (!truthy(env.NOINDEX)) return res;
  // An answer of the assets binding has immutable headers: copy it.
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
}
