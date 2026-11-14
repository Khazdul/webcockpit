// The Worker's request router (spec §7.1, ADR 0144). Plain `Request` in,
// `Response` out, and nothing from the Workers runtime but the assets
// binding, so scripts/static-server.ts runs this same code under Node
// (its `cloudflare` profile) with a stub for the binding.
//
//   GET /api/health   { ok, version, commit } of the deployed build
//   GET /api/config   { flags }: the server flags that open cloud features
//   other /api/*      404 { error: "not_found" }; a wrong method is
//                     405 { error: "method_not_allowed" }
//   anything else     the static assets (only reached when no file matched
//                     and the request is not a navigation: a 404)
//
// API conventions (spec §7.1): JSON, errors as { error: "<code>" } with a
// fitting status, never cached. `_headers` does not apply to what a Worker
// answers, so the API sets its own headers here.

import type { Config, Health } from '../shared/cloud/api.ts';

/** The static assets binding (`assets.binding` in wrangler.jsonc), as far as the router uses it. */
export interface AssetsBinding {
  fetch(input: Request | URL | string): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
}

export const API_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
}

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

type Handler = (request: Request, env: Env, url: URL) => Response | Promise<Response>;

/** The API's routes: path → method → handler. */
const ROUTES: Record<string, Record<string, Handler>> = {
  '/api/health': {
    GET: async (_request, env, url) => json({ ok: true, ...(await release(env, url.origin)) } satisfies Health),
  },
  '/api/config': {
    GET: () => json({ flags: {} } satisfies Config),
  },
};

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  const route = Object.hasOwn(ROUTES, url.pathname) ? ROUTES[url.pathname] : undefined;
  if (!route) return json({ error: 'not_found' }, 404);
  // HEAD is GET without the body, as for the static files.
  const head = request.method === 'HEAD';
  const method = head ? 'GET' : request.method;
  const handler = Object.hasOwn(route, method) ? route[method] : undefined;
  if (!handler) return json({ error: 'method_not_allowed' }, 405, { Allow: Object.keys(route).join(', ') });
  const res = await handler(request, env, url);
  return head ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
