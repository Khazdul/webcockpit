// The admin's moderation endpoints called past the Access check (which
// admin.test.ts tests): the route's handler itself, with `X-WC` and the
// same Origin. For the community's tests.
import { moderationRoute } from '../moderation.ts';
import type { Env } from '../runtime.ts';
import { at } from './helpers.ts';
import { CENV } from './community-helpers.ts';
import { NOW, ORIGIN } from './share-helpers.ts';

export async function adminCall(path: string, body?: unknown, o: { env?: Env; now?: number } = {}): Promise<Response> {
  const route = moderationRoute(path);
  const method = body === undefined ? 'GET' : 'POST';
  const handler = route?.[method];
  if (!handler) return new Response(null, { status: 404 });
  const init: RequestInit = { method, headers: { 'X-WC': '1', Origin: ORIGIN, 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = `${ORIGIN}${path}`;
  return handler(new Request(url, init), o.env ?? CENV, new URL(url), at(o.now ?? NOW), 'test-admin');
}
