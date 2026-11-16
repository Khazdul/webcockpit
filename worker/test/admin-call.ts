// The admin's endpoints called past the Access check (which admin.test.ts
// tests): the route's handler itself, with `X-WC` and the same Origin. For
// the community's tests and the panel's (stage 66).
import { adminRoute } from '../router.ts';
import type { Env } from '../runtime.ts';
import { at } from './helpers.ts';
import { CENV } from './community-helpers.ts';
import { NOW, ORIGIN } from './share-helpers.ts';

export async function adminCall(path: string, body?: unknown, o: { env?: Env; now?: number; method?: string; who?: string } = {}): Promise<Response> {
  const route = adminRoute(path);
  const method = o.method ?? (body === undefined ? 'GET' : 'POST');
  const handler = route?.[method];
  if (!handler) return new Response(null, { status: 404 });
  const init: RequestInit = { method, headers: { 'X-WC': '1', Origin: ORIGIN, 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = `${ORIGIN}${path}`;
  return handler(new Request(url, init), o.env ?? CENV, new URL(url), at(o.now ?? NOW), o.who ?? 'test-admin');
}
